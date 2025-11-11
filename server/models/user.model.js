import mongoose from "mongoose"

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    enum: ["admin", "employee"],
    default: "employee",
  },
  department: {
    type: String,
    required: true,
  },
  employeeId: {
    type: Number,
    required: true,
    unique: true,
  },
  email: {
    type: String,
    required: true,
  },
  tenure: {
    type: String,
    required: true,
    enum: ["0-6 months", "up to 1 year", "Less than 5 years", "more than 5 years", "5+ years"],
  },
  isEmailVerified: {
    type: Boolean,
    default: false,
  },
  emailVerificationOTP: String,
  otpExpires: Date,
  passwordResetCode: String,
  resetCodeExpires: Date,
})

userSchema.index({ email: 1 }, { unique: false, background: true })

export default mongoose.model("User", userSchema)
