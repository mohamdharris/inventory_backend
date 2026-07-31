const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // e.g. 'productId'
  seq: { type: Number, default: 0 },
});

const Counter = mongoose.model('Counter', counterSchema);

// Atomically increments and returns the next sequence value for a given name
async function getNextSequence(name) {
  const counter = await Counter.findByIdAndUpdate(
    name,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return counter.seq;
}

module.exports = { getNextSequence };
