// /controllers/api/userRoutes.js
const router = require("express").Router();
const { User } = require("../../models");
const bcrypt = require("bcrypt");
const crypto = require('crypto');
const jwt = require("jsonwebtoken");
const { Op } = require("sequelize");
const { sendSmsToUser } = require('../../utils/smsUtils');
const { authenticateToken } = require('../../middleware/auth.middleware');


/**
 * GET /api/users
 * Return all users (for dev/testing)
 */
router.get("/", async (req, res) => {
  try {
    const users = await User.findAll({});
    res.json(users);
  } catch (err) {
    res.status(500).json(err);
  }
});

/**
 * GET /api/users/me
 * Return the currently authenticated user
 * yes user is auth'd
 */
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: { exclude: ['password_hash'] },
    });
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json(user);
  } catch (err) {
    res.status(500).json(err);
  }
});

/**
 * POST /api/users/login
 * Basic login with phone & password
 */
router.post("/login", async (req, res) => {
  try {
    const { phone, password } = req.body;
    
    // Normalize phone - strip non-digits (same as signup)
    const digitsOnly = phone.replace(/\D/g, "");
    
    const user = await User.findOne({ where: { phone: digitsOnly } });
    if (!user) {
      return res.status(400).json({
        message: "Incorrect phone number or password, please try again",
      });
    }

    // If user has no password set in DB => can't log in
    if (!user.password_hash || user.password_hash.trim() === "") {
      return res.status(400).json({
        code: "NO_PASSWORD_SET",
        message:
          "A password has not been set for this phone number. Please set a password to complete sign up.",
      });
    }

    // check password
    const validPassword = await bcrypt.compare(password, user.password_hash || "");
    if (!validPassword) {
      return res.status(400).json({
        message: "Incorrect phone number or password, please try again",
      });
    }

    // Update last_login_at
    user.last_login_at = new Date();
    await user.save();

    const token = jwt.sign(
      { id: user.id, phone: user.phone, email: user.email },
      process.env.SECRET,
      { expiresIn: "8h" }
    );

    res.status(200).json({
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        role: user.role,
        customer_company_id: user.customer_company_id,
        status: user.status,
      },
      token,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /api/users/reset-password
 * Example to send an SMS with a reset token
 */
router.post("/reset-password", async (req, res) => {
  const { phone } = req.body;
  if (!phone) {
    return res.status(400).json({ error: "Phone number is required" });
  }

  // Normalize phone - strip non-digits
  const digitsOnly = phone.replace(/\D/g, "");

  const user = await User.findOne({ where: { phone: digitsOnly } });
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  // Generate reset token
  const resetToken = crypto.randomBytes(32).toString("hex");
  const tokenExpires = new Date(Date.now() + 3600000); // 1 hour
  user.resetPasswordToken = resetToken;
  user.resetPasswordExpires = tokenExpires;
  await user.save();

  const resetUrl = `${process.env.FRONTEND_URL}/auth/reset-password/complete?token=${resetToken}`;
  await sendSmsToUser(user.id, `Reset your password: ${resetUrl}`);

  res.status(200).json({ message: "Password reset link sent via SMS" });
});

/**
 * POST /api/users/reset-password/confirm
 */
router.post("/reset-password/confirm", async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) {
    return res.status(400).json({ error: "Token and password are required" });
  }

  const user = await User.findOne({
    where: {
      resetPasswordToken: token,
      resetPasswordExpires: { [Op.gt]: new Date() },
    },
  });
  if (!user) {
    return res.status(400).json({ error: "Invalid or expired token" });
  }

  const salt = await bcrypt.genSalt(10);
  user.password_hash = await bcrypt.hash(password, salt);
  user.resetPasswordToken = null;
  user.resetPasswordExpires = null;
  await user.save();

  return res
    .status(200)
    .json({ message: "Password has been reset successfully" });
});


/** It checks whether a user already exists in the system by phone number.
 * GET /api/users/check-existence?phone=...
 */
router.get("/check-existence", async (req, res) => {
  try {
    const { phone } = req.query;
    if (!phone) {
      return res.status(400).json({ message: "phone is required" });
    }

    // Normalize phone - strip non-digits
    const digitsOnly = phone.replace(/\D/g, "");

    const user = await User.findOne({ where: { phone: digitsOnly } });
    if (!user) {
      return res.json({ exists: false, hasPassword: false });
    }

    const hasPassword = user.password_hash && user.password_hash.trim() !== "";
    return res.json({ exists: true, hasPassword });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error checking user existence" });
  }
});

/**
 * POST /api/users/signup
 * Create a new user account
 */
router.post("/signup", async (req, res) => {
  try {
    const { phone, password, name, email, role } = req.body;

    if (!phone) {
      return res.status(400).json({ error: "Phone number is required" });
    }
    if (!password) {
      return res.status(400).json({ error: "Password is required" });
    }

    // Normalize phone - strip non-digits
    const digitsOnly = phone.replace(/\D/g, "");

    // Check if user already exists
    const existingUser = await User.findOne({ where: { phone: digitsOnly } });
    if (existingUser) {
      return res.status(400).json({ 
        error: "User with this phone number already exists",
        code: "USER_EXISTS"
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    // Determine role - default to customer_member, but allow internal roles
    const userRole = role || 'customer_member';
    const validRoles = ['internal_admin', 'internal_sales', 'customer_admin', 'customer_member'];
    if (!validRoles.includes(userRole)) {
      return res.status(400).json({ error: `Invalid role. Must be one of: ${validRoles.join(', ')}` });
    }

    // Create user
    const user = await User.create({
      phone: digitsOnly,
      password_hash,
      name: name || null,
      email: email || null,
      role: userRole,
      customer_company_id: null, // Will be set later for customer users
      status: 'new',
    });

    // Generate token
    const token = jwt.sign(
      { id: user.id, phone: user.phone, email: user.email },
      process.env.SECRET,
      { expiresIn: "8h" }
    );

    return res.status(201).json({
      message: "User created successfully",
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        role: user.role,
        customer_company_id: user.customer_company_id,
      },
      token,
    });
  } catch (err) {
    console.error("Error in /signup:", err);
    return res.status(500).json({ error: "Server error", details: err.message });
  }
});

/**
 * POST /api/users/set-password
 * For casual users (non-business) to set a password and log in immediately.
 */
router.post("/set-password", async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone) {
      return res.status(400).json({ error: "Phone number is required" });
    }
    if (!password) {
      return res.status(400).json({ error: "Password is required" });
    }

    // Normalize phone if you have a helper; otherwise, just strip non-digits
    const digitsOnly = phone.replace(/\D/g, "");

    const user = await User.findOne({ where: { phone: digitsOnly } });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Prevent business accounts from using this casual-user endpoint
    if (user.status === "business") {
      return res.status(400).json({ error: "This endpoint is only for casual users" });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    user.password_hash = await bcrypt.hash(password, salt);

    // If user is 'new' or has no status, move them to 'joined'
    if (!user.status || user.status === "new") {
      user.status = "joined";
    }

    await user.save();

    // Generate token
    const token = jwt.sign(
      { id: user.id, phone: user.phone },
      process.env.SECRET,
      { expiresIn: "8h" }
    );

    return res.status(200).json({
      message: "Password set successfully",
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        email: user.email
      },
      token
    });
  } catch (err) {
    console.error("Error in /set-password:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
