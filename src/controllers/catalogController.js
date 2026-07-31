const allProducts = require('../data/productCatalog');

// GET /api/productList
function productList(req, res) {
  res.json({
    errorCode: 0,
    msg: 'Fetched successfully',
    data: allProducts,
  });
}

module.exports = { productList };
