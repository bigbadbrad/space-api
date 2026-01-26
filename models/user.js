// /models/user.js
const { Model, DataTypes } = require('sequelize');
const bcrypt = require('bcrypt');
const sequelize = require('../config/connection');

class User extends Model {
  // You can add instance or class methods here if needed (e.g. password check)
}

User.init(
  {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    // Full name or "legal name"
    name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    // For convenience, a user might have a shorter preferred name
    preferred_name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    // For phone-based signups / notifications (KEEPING AS PRIMARY LOGIN)
    phone: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        // e.g., must be digits only
        is: /^[0-9]{10,15}$/,
      },
    },
    // Standard email
    email: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
      validate: {
        isEmail: true,
      },
    },
    // Password hash (renamed from password to match spec)
    password_hash: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: '',
    },
    // Role: internal_admin, internal_sales, customer_admin, customer_member
    role: {
      type: DataTypes.ENUM('internal_admin', 'internal_sales', 'customer_admin', 'customer_member'),
      allowNull: false,
      defaultValue: 'customer_member',
    },
    // If NULL → Internal user, if SET → Customer user
    customer_company_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'customer_companies',
        key: 'id',
      },
    },
    last_login_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    // Legacy fields kept for compatibility
    status: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    is_staff: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    // Legacy password field (maps to password_hash for backward compatibility)
    password: {
      type: DataTypes.VIRTUAL,
      get() {
        return this.password_hash;
      },
      set(value) {
        this.setDataValue('password_hash', value);
      },
    },
    home: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    stripeCustomerId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    resetPasswordToken: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    resetPasswordExpires: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    // For text messaging unsubscribes
    isUnsubscribed: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    is_admin: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    referrerId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id',
      },
    },
  },
  {
    sequelize,
    modelName: 'User',
    tableName: 'users',
    freezeTableName: true,
    underscored: true,
    timestamps: true, // createdAt, updatedAt
  }
);

module.exports = User;
