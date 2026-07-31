const Employee = require('../models/Employee');
const { ROLE_PREFIX, resolveHierarchyId } = require('../utils/hierarchy');

// Parses "yyyy-MM-dd HH:mm:ss" (24-hour). Falls back to native Date parsing
// for other reasonable formats (e.g. plain "yyyy-MM-dd").
function parseDateTime(value) {
  if (!value || typeof value !== 'string') return new Date(NaN);

  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?$/);
  if (match) {
    const [, year, month, day, hour = '00', minute = '00', second = '00'] = match;
    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second)
    );
  }

  return new Date(value);
}

// POST /api/users/create
// Body: role (admin/mainagent/stockist/retailer), parentId (required for stockist/retailer,
// ignored for admin, optional for mainagent since there's only ever one admin),
// name, dName, designation, mobileNo, email, address, dateOfJoin, yearsOfExperience, active (optional, default 1)
async function createUser(req, res) {
  try {
    const {
      role,
      parentId,
      name,
      dName,
      designation,
      mobileNo,
      email,
      address,
      dateOfJoin,
      yearsOfExperience,
      active,
    } = req.body;

    if (!role || !ROLE_PREFIX[role]) {
      return res.status(400).json({
        errorCode: 5,
        msg: '----- role ----- field is required and must be one of admin, mainagent, stockist, retailer.',
      });
    }

    const missing = [];
    if (!name) missing.push('name');
    if (!dName) missing.push('dName');
    if (!designation) missing.push('designation');
    if (!mobileNo) missing.push('mobileNo');
    if (!email) missing.push('email');
    if (!address) missing.push('address');
    if (!dateOfJoin) missing.push('dateOfJoin');
    if (yearsOfExperience === undefined || yearsOfExperience === null || yearsOfExperience === '') {
      missing.push('yearsOfExperience');
    }

    if (missing.length > 0) {
      return res.status(400).json({
        errorCode: 5,
        msg: `----- ${missing[0]} ----- field is required.`,
      });
    }

    const existing = await Employee.findOne({ name });
    if (existing) {
      return res.status(409).json({
        errorCode: 4,
        msg: 'User name already exists',
      });
    }

    let hierarchy;
    try {
      hierarchy = await resolveHierarchyId(role, parentId);
    } catch (hierarchyErr) {
      return res.status(400).json({ errorCode: 1, msg: hierarchyErr.message });
    }

    await Employee.create({
      id: hierarchy.id,
      role,
      parentId: hierarchy.parentId,
      name,
      dName,
      designation,
      mobileNo,
      email,
      address,
      dateOfJoin,
      yearsOfExperience,
      active,
    });

    res.status(201).json({
      errorCode: 0,
      msg: 'User added Successfully',
      data: { id: hierarchy.id, role, parentId: hierarchy.parentId },
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ errorCode: 4, msg: 'User name already exists' });
    }
    res.status(400).json({ errorCode: 1, msg: err.message });
  }
}

const USER_TYPE_MAP = { 1: 'admin', 2: 'mainagent', 3: 'stockist', 4: 'retailer' };

// POST /api/users/search
// Body: startDate (mandatory), endDate (mandatory), userType (mandatory: 1=admin, 2=mainagent, 3=stockist, 4=retailer),
// designation, name, status, parentId (optional), page (mandatory)
// Filters by dateOfJoin between startDate and endDate. Returns 10 results per page.
async function searchUser(req, res) {
  try {
    const { startDate, endDate, designation, name, status, userType, parentId, page } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({ errorCode: 1, msg: 'startDate and endDate are required.' });
    }
    if (page === undefined || page === null || page === '') {
      return res.status(400).json({ errorCode: 1, msg: 'page is required.' });
    }
    if (userType === undefined || userType === null || userType === '') {
      return res.status(400).json({ errorCode: 1, msg: 'userType is required (1=admin, 2=mainagent, 3=stockist, 4=retailer).' });
    }
    const role = USER_TYPE_MAP[Number(userType)];
    if (!role) {
      return res.status(400).json({ errorCode: 1, msg: 'userType must be 1 (admin), 2 (mainagent), 3 (stockist), or 4 (retailer).' });
    }

    const start = parseDateTime(startDate);
    const end = parseDateTime(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        errorCode: 1,
        msg: 'startDate and endDate must be in format yyyy-MM-dd HH:mm:ss (e.g. 2026-01-01 00:00:00).',
      });
    }

    // Each role may only search roles strictly below it in the hierarchy.
    const ALLOWED_TARGETS = {
      admin: ['admin', 'mainagent', 'stockist', 'retailer'],
      mainagent: ['stockist', 'retailer'],
      stockist: ['retailer'],
      retailer: [],
    };

    const requesterRole = req.user.role;
    const requesterId = req.user.id;
    const allowedTargets = ALLOWED_TARGETS[requesterRole] || [];

    if (!allowedTargets.includes(role)) {
      return res.status(403).json({
        errorCode: 7,
        msg: `${requesterRole} is not allowed to search userType ${userType}.`,
      });
    }

    const filter = {
      dateOfJoin: { $gte: start, $lte: end },
      role,
    };

    if (designation) {
      filter.designation = new RegExp(designation.trim(), 'i');
    }
    if (name) {
      filter.$or = [{ name: new RegExp(name.trim(), 'i') }, { dName: new RegExp(name.trim(), 'i') }];
    }
    if (status !== undefined && status !== null && status !== '') {
      filter.active = Number(status);
    }

    // Auto-scope results to the requester's own branch of the hierarchy,
    // ignoring/overriding any parentId the client tried to send.
    if (requesterRole === 'stockist') {
      // A stockist can only ever see their own retailers.
      filter.parentId = requesterId;
    } else if (requesterRole === 'mainagent') {
      if (role === 'stockist') {
        // A mainagent can only see their own stockists.
        filter.parentId = requesterId;
      } else if (role === 'retailer') {
        // A mainagent can see retailers under any of their own stockists.
        const ownStockists = await Employee.find({ parentId: requesterId, role: 'stockist' }).select('id');
        filter.parentId = { $in: ownStockists.map((s) => s.id) };
      }
    } else if (requesterRole === 'admin' && parentId) {
      // Admin has no restriction, but can still filter by parentId if provided.
      filter.parentId = parentId;
    }

    const pageSize = 10;
    const currentPage = Math.max(1, parseInt(page) || 1);
    const skip = (currentPage - 1) * pageSize;

    const totalLength = await Employee.countDocuments(filter);
    const totalPage = Math.max(1, Math.ceil(totalLength / pageSize));

    const users = await Employee.find(filter)
      .sort({ id: 1 })
      .skip(skip)
      .limit(pageSize);

    res.json({
      errorCode: 0,
      msg: 'Search successful',
      totalLength,
      totalPage,
      currentPage,
      data: users,
    });
  } catch (err) {
    res.status(500).json({ errorCode: 1, msg: err.message });
  }
}

// POST /api/users/customerName
// Body: customerType (mandatory: 1=admin, 2=mainagent, 3=stockist, 4=retailer), parentId (mandatory), id (mandatory)
// Returns just id, name, dName for the matching hierarchy user.
async function getCustomerName(req, res) {
  try {
    const { customerType, parentId, id } = req.body;

    if (customerType === undefined || customerType === null || customerType === '') {
      return res.status(400).json({ errorCode: 1, msg: 'customerType is required (1=admin, 2=mainagent, 3=stockist, 4=retailer).' });
    }
    const role = USER_TYPE_MAP[Number(customerType)];
    if (!role) {
      return res.status(400).json({ errorCode: 1, msg: 'customerType must be 1 (admin), 2 (mainagent), 3 (stockist), or 4 (retailer).' });
    }
    if (!parentId) {
      return res.status(400).json({ errorCode: 1, msg: 'parentId is required.' });
    }
    if (!id) {
      return res.status(400).json({ errorCode: 1, msg: 'id is required.' });
    }

    const user = await Employee.findOne({ id, parentId, role });
    if (!user) {
      return res.status(404).json({ errorCode: 1, msg: 'No matching user found.' });
    }

    res.json({
      errorCode: 0,
      msg: 'Fetched successfully',
      data: {
        id: user.id,
        name: user.name,
        dName: user.dName,
      },
    });
  } catch (err) {
    res.status(500).json({ errorCode: 1, msg: err.message });
  }
}

// GET /api/users/updateInit
// Body: { id, parentId (optional, disambiguates when the same code exists under different parents) }
async function getUpdateInit(req, res) {
  try {
    const { id, parentId } = req.body;
    if (!id) {
      return res.status(400).json({ errorCode: 1, msg: 'id is required.' });
    }

    const filter = { id };
    if (parentId !== undefined && parentId !== null && parentId !== '') {
      filter.parentId = parentId;
    }

    const user = await Employee.findOne(filter);
    if (!user) {
      return res.status(404).json({ errorCode: 1, msg: `User with id ${id} not found.` });
    }

    res.json({
      errorCode: 0,
      msg: 'User fetched successfully',
      data: user,
    });
  } catch (err) {
    res.status(500).json({ errorCode: 1, msg: err.message });
  }
}

// POST /api/users/update
// Body: id (mandatory), parentId (optional, disambiguates same code under different parents),
// del (optional boolean), name, dName, designation, mobileNo, email, address, dateOfJoin, yearsOfExperience, active
// If del is true, the user is deleted instead of updated.
// name cannot be changed. Any field left null/omitted keeps its previously stored value.
async function updateUser(req, res) {
  try {
    const { id, parentId, del, name, dName, designation, mobileNo, email, address, dateOfJoin, yearsOfExperience, active } = req.body;

    if (!id) {
      return res.status(400).json({ errorCode: 1, msg: 'id is required.' });
    }

    const filter = { id };
    if (parentId !== undefined && parentId !== null && parentId !== '') {
      filter.parentId = parentId;
    }

    const user = await Employee.findOne(filter);
    if (!user) {
      return res.status(400).json({ errorCode: 6, msg: `Cannot update. User id ${id} does not exist or was changed.` });
    }

    if (del === true) {
      await Employee.deleteOne({ _id: user._id });
      return res.json({
        errorCode: 0,
        msg: 'User Deleted Successfully',
      });
    }

    if (name !== undefined && name !== null && name !== user.name) {
      return res.status(400).json({ errorCode: 2, msg: 'name cannot be updated.' });
    }

    // Only overwrite a field if a non-null value was actually provided;
    // null or omitted means "keep the previous value".
    if (dName !== undefined && dName !== null) user.dName = dName;
    if (designation !== undefined && designation !== null) user.designation = designation;
    if (mobileNo !== undefined && mobileNo !== null) user.mobileNo = mobileNo;
    if (email !== undefined && email !== null) user.email = email;
    if (address !== undefined && address !== null) user.address = address;
    if (dateOfJoin !== undefined && dateOfJoin !== null) user.dateOfJoin = dateOfJoin;
    if (yearsOfExperience !== undefined && yearsOfExperience !== null) user.yearsOfExperience = yearsOfExperience;
    if (active !== undefined && active !== null) user.active = active;

    await user.save();

    res.json({
      errorCode: 0,
      msg: 'User Updated Successfully',
    });
  } catch (err) {
    res.status(400).json({ errorCode: 1, msg: err.message });
  }
}

module.exports = { createUser, searchUser, getUpdateInit, updateUser, getCustomerName };
