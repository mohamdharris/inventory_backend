const express = require('express');
const router = express.Router();
const { createUser, searchUser, getUpdateInit, updateUser, getCustomerName } = require('../controllers/usersController');

router.post('/create', createUser);
router.post('/search', searchUser);
router.get('/updateInit', getUpdateInit);
router.post('/update', updateUser);
router.post('/customerName', getCustomerName);

module.exports = router;
