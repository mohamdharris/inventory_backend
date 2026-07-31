const express = require('express');
const router = express.Router();
const { productList } = require('../controllers/catalogController');

router.get('/productList', productList);

module.exports = router;
