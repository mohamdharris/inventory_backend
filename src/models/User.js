const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const userSchema = new mongoose.Schema(
  {
    id: {
      type: String,
    },
    role: {
      type: String,
      required: [true, 'role is required.'],
      enum: {
        values: ['admin', 'mainagent', 'stockist', 'retailer'],
        message: 'role must be one of admin, mainagent, stockist, retailer.',
      },
    },
    // For mainagent: the admin's id. For stockist: the mainagent's id.
    // For retailer: the stockist's id. null for admin.
    parentId: {
      type: String,
      default: null,
    },
    name: {
      type: String,
      required: [true, 'name is required.'],
      trim: true,
      unique: true,
    },
    password: {
      type: String,
      required: [true, 'password is required.'],
    },
    mobileNumber: {
      type: String,
      required: [true, 'mobileNumber is required.'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'email is required.'],
      trim: true,
      lowercase: true,
      unique: true,
      match: [EMAIL_REGEX, 'email must be a valid email address.'],
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    verificationToken: {
      type: String,
      default: null,
    },
    verificationTokenExpires: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        delete ret.password;
        delete ret.verificationToken;
        delete ret.verificationTokenExpires;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Hash the password before saving, only if it changed
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
