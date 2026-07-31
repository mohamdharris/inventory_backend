const Product = require('../models/Product');

// GET /api/products
async function getAllProducts(req, res) {
  try {
    const products = await Product.find().sort({ id: 1 });
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch products.', details: err.message });
  }
}

// GET /api/products/:id  (numeric sequential id, e.g. 1, 2, 3)
async function getProductById(req, res) {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'id must be a number.' });
    }

    const product = await Product.findOne({ id });
    if (!product) {
      return res.status(404).json({ error: `Product with id ${id} not found.` });
    }
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch product.', details: err.message });
  }
}

// POST /api/products
async function createProduct(req, res) {
  try {
    const { name, dName, shortName, qty, stockQty, active } = req.body;

    const missing = [];
    if (!name) missing.push('name');
    if (!dName) missing.push('dName');
    if (!shortName) missing.push('shortName');
    if (qty === undefined || qty === null || qty === '') missing.push('qty');
    if (stockQty === undefined || stockQty === null || stockQty === '') missing.push('stockQty');

    if (missing.length > 0) {
      return res.status(400).json({
        errorCode: 1,
        msg: `${missing.join(', ')} ${missing.length > 1 ? 'are' : 'is'} required.`,
      });
    }

    const existing = await Product.findOne({ name });
    if (existing) {
      return res.status(409).json({
        errorCode: 1,
        msg: 'Name is already exists',
      });
    }

    await Product.create({ name, dName, shortName, qty, stockQty, active });
    res.status(201).json({
      errorCode: 0,
      msg: 'Product added Successfully',
    });
  } catch (err) {
    // Fallback in case of a race condition on the unique index
    if (err.code === 11000) {
      return res.status(409).json({
        errorCode: 1,
        msg: 'Name is already exists',
      });
    }
    res.status(400).json({
      errorCode: 1,
      msg: err.message,
    });
  }
}

// GET /api/products/updateInit
// Body: { "id": 1 }
// Returns full product data, meant to pre-fill an edit form.
async function getUpdateInit(req, res) {
  try {
    const id = Number(req.body.id);
    if (isNaN(id)) {
      return res.status(400).json({ errorCode: 1, msg: 'id must be a number.' });
    }

    const product = await Product.findOne({ id });
    if (!product) {
      return res.status(404).json({ errorCode: 1, msg: `Product with id ${id} not found.` });
    }

    res.json({
      errorCode: 0,
      msg: 'Product fetched successfully',
      data: product,
    });
  } catch (err) {
    res.status(500).json({ errorCode: 1, msg: err.message });
  }
}

// POST /api/products/update
// Body: { "id": 1, "shortName": "...", "dName": "...", "active": 1, "qty": 5, "name": "...", "stockQty": 100 }
// Allows editing shortName, dName, active, qty only.
// Blocks changes to name and stockQty.
async function updateProductRestricted(req, res) {
  try {
    const id = Number(req.body.id);
    if (isNaN(id)) {
      return res.status(400).json({ errorCode: 1, msg: 'id must be a number.' });
    }

    const product = await Product.findOne({ id });
    if (!product) {
      return res.status(404).json({ errorCode: 1, msg: `Product with id ${id} not found.` });
    }

    const { del, shortName, dName, active, qty, name, stockQty } = req.body;

    if (del === true) {
      await Product.findOneAndDelete({ id });
      return res.json({
        errorCode: 0,
        msg: 'Product Deleted Successfully',
      });
    }

    if (name !== undefined && name !== product.name) {
      return res.status(400).json({ errorCode: 2, msg: 'name cannot be updated.' });
    }
    if (stockQty !== undefined && Number(stockQty) !== product.stockQty) {
      return res.status(400).json({ errorCode: 2, msg: 'stockQty cannot be updated.' });
    }

    if (shortName !== undefined) product.shortName = shortName;
    if (dName !== undefined) product.dName = dName;
    if (active !== undefined) product.active = active;
    if (qty !== undefined) product.qty = qty;

    await product.save();

    res.json({
      errorCode: 0,
      msg: 'Product Updated Successfully',
    });
  } catch (err) {
    res.status(400).json({ errorCode: 1, msg: err.message });
  }
}

// PUT /api/products/:id
async function updateProduct(req, res) {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'id must be a number.' });
    }

    // Prevent overwriting the auto-generated sequential id
    const updates = { ...req.body };
    delete updates.id;

    const product = await Product.findOneAndUpdate(
      { id },
      updates,
      { new: true, runValidators: true }
    );
    if (!product) {
      return res.status(404).json({ error: `Product with id ${id} not found.` });
    }
    res.json(product);
  } catch (err) {
    res.status(400).json({ error: 'Update failed.', details: err.message });
  }
}

// DELETE /api/products/:id
async function deleteProduct(req, res) {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'id must be a number.' });
    }

    const product = await Product.findOneAndDelete({ id });
    if (!product) {
      return res.status(404).json({ error: `Product with id ${id} not found.` });
    }
    res.json({ message: 'Product deleted.', product });
  } catch (err) {
    res.status(400).json({ error: 'Delete failed.', details: err.message });
  }
}

// POST /api/products/search
// Body (all fields optional, combine any of them):
// { "startDate": "2026-07-27", "endDate": "2026-07-28", "name": "WMouse", "page": 1 }
// Returns 10 results per page.
async function searchProducts(req, res) {
  try {
    const { startDate, endDate, name, page } = req.body;
    const filter = {};

    if (startDate || endDate) {
      if (!startDate || !endDate) {
        return res.status(400).json({ error: 'Both startDate and endDate are required together.' });
      }

      const start = new Date(startDate);
      const end = new Date(endDate);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({ error: 'startDate and endDate must be valid dates (e.g. 2026-01-01).' });
      }

      // Include the entire end day
      end.setHours(23, 59, 59, 999);
      filter.createdAt = { $gte: start, $lte: end };
    }

    if (name) {
      if (typeof name !== 'string' || name.trim() === '') {
        return res.status(400).json({ error: 'name must be a non-empty string.' });
      }
      const regex = new RegExp(name.trim(), 'i');
      filter.$or = [{ name: regex }, { dName: regex }, { shortName: regex }];
    }

    const pageSize = 10;
    const currentPage = Math.max(1, parseInt(page) || 1);
    const skip = (currentPage - 1) * pageSize;

    const totalLength = await Product.countDocuments(filter);
    const totalPage = Math.max(1, Math.ceil(totalLength / pageSize));

    const products = await Product.find(filter)
      .sort({ id: 1 })
      .skip(skip)
      .limit(pageSize);

    res.json({
      errorCode: 0,
      msg: 'Search successful',
      totalLength,
      totalPage,
      currentPage,
      data: products,
    });
  } catch (err) {
    res.status(500).json({ error: 'Search failed.', details: err.message });
  }
}

module.exports = {
  getAllProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  searchProducts,
  getUpdateInit,
  updateProductRestricted,
};
