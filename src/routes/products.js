const express = require('express');
const router = express.Router();
const {
  getAllProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  searchProducts,
  getUpdateInit,
  updateProductRestricted,
} = require('../controllers/productsController');

router.get('/', getAllProducts);
router.post('/search', searchProducts);
router.get('/updateInit', getUpdateInit);
router.post('/update', updateProductRestricted);
router.post('/create', createProduct);
router.get('/:id', getProductById);
router.put('/:id', updateProduct);
router.delete('/:id', deleteProduct);

module.exports = router;
