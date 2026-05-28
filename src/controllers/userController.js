const userService = require('../services/userService');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');

const register = asyncHandler(async (req, res) => {
  const { phone, role } = req.body;
const result = await userService.registerUser(phone, role);

  sendSuccess(res, {
    statusCode: 201,
    message: 'User registered successfully.',
    data: result,
  });
});

const sendOtp = asyncHandler(async (req, res) => {
  const { phone } = req.body;
  const result = await userService.sendOtp(phone);

  sendSuccess(res, {
    message: 'OTP sent successfully.',
    data: result,
  });
});

const verifyOtp = asyncHandler(async (req, res) => {
  const { phone, otp } = req.body;
  const result = await userService.verifyOtp(phone, otp);

  sendSuccess(res, {
    message: 'OTP verified successfully.',
    data: result,
  });
});

const login = asyncHandler(async (req, res) => {
  const { phone } = req.body;
  const result = await userService.loginUser(phone);

  sendSuccess(res, {
    message: 'Login OTP sent successfully.',
    data: result,
  });
});

const logout = asyncHandler(async (req, res) => {
  const result = await userService.logoutUser(req.user.userId, req.token, req.user.exp);

  sendSuccess(res, {
    message: 'Logged out successfully.',
    data: result,
  });
});

const getProfile = asyncHandler(async (req, res) => {
  const result = await userService.getProfile(req.user.userId);

  sendSuccess(res, {
    message: 'User profile fetched successfully.',
    data: result,
  });
});

const updateProfile = asyncHandler(async (req, res) => {
  const result = await userService.updateProfile(req.user.userId, req.body);

  sendSuccess(res, {
    message: 'User profile updated successfully.',
    data: result,
  });
});

const getUserById = asyncHandler(async (req, res) => {
  const result = await userService.getUserById(req.params.userId);

  sendSuccess(res, {
    message: 'User fetched successfully.',
    data: result,
  });
});

module.exports = {
  register,
  sendOtp,
  verifyOtp,
  login,
  logout,
  getProfile,
  updateProfile,
  getUserById,
};
