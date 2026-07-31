const Employee = require('../models/Employee');
const User = require('../models/User');
const { getNextSequence } = require('../models/Counter');

const ROLE_PREFIX = {
  admin: 'ad',
  mainagent: 'ma',
  stockist: 'st',
  retailer: 'rt',
};

// A parent (admin/mainagent/stockist) may have been created via either
// /api/users/create (business profile) or /api/auth/signup (login account).
// Check both so either path satisfies the hierarchy check.
async function findHierarchyRecord(query) {
  const fromEmployee = await Employee.findOne(query);
  if (fromEmployee) return fromEmployee;
  return User.findOne(query);
}

// Works out the id and parentId for a new hierarchy user based on its role.
// - admin: no parent, globally sequential (ad1, ad2, ...)
// - mainagent: parent is the (single) admin, globally sequential (ma1, ma2, ...)
// - stockist: parent is a mainagent, sequence restarts at 1 for each mainagent
// - retailer: parent is a stockist, sequence restarts at 1 for each stockist
// Validates the parent exists by checking the Employee (business profile) records.
// Throws a plain Error with a user-facing message on any validation failure.
async function resolveHierarchyId(role, parentId) {
  const prefix = ROLE_PREFIX[role];
  if (!prefix) {
    throw new Error('Invalid role.');
  }

  if (role === 'admin') {
    const seq = await getNextSequence('admin');
    return { id: `${prefix}${seq}`, parentId: null };
  }

  if (role === 'mainagent') {
    const admin = await findHierarchyRecord({ role: 'admin' });
    if (!admin) {
      throw new Error('An Admin must be created before a Main Agent.');
    }
    const seq = await getNextSequence('mainagent');
    return { id: `${prefix}${seq}`, parentId: admin.id };
  }

  if (role === 'stockist') {
    if (!parentId) {
      throw new Error('parentId (Main Agent id) is required to create a Stockist.');
    }
    const mainAgent = await findHierarchyRecord({ id: parentId, role: 'mainagent' });
    if (!mainAgent) {
      throw new Error(`Main Agent with id ${parentId} not found.`);
    }
    const seq = await getNextSequence(`stockist:${parentId}`);
    return { id: `${prefix}${seq}`, parentId };
  }

  if (role === 'retailer') {
    if (!parentId) {
      throw new Error('parentId (Stockist id) is required to create a Retailer.');
    }
    const stockist = await findHierarchyRecord({ id: parentId, role: 'stockist' });
    if (!stockist) {
      throw new Error(`Stockist with id ${parentId} not found.`);
    }
    const seq = await getNextSequence(`retailer:${parentId}`);
    return { id: `${prefix}${seq}`, parentId };
  }

  throw new Error('Invalid role.');
}

module.exports = { ROLE_PREFIX, resolveHierarchyId };
