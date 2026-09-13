const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const User = sequelize.define(
    "User",
    {
        id: {
            type: DataTypes.BIGINT.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },

        telegram_id: {
            type: DataTypes.BIGINT,
            allowNull: false,
            unique: true,
        },

        username: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },

        first_name: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },

        last_name: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },

        phone: {
            type: DataTypes.STRING(30),
            allowNull: true,
        },

        role: {
            type: DataTypes.ENUM(
                "customer",
                "employee",
                "admin",
                "owner"
            ),
            allowNull: false,
            defaultValue: "customer",
        },

        status: {
            type: DataTypes.ENUM(
                "active",
                "blocked"
            ),
            allowNull: false,
            defaultValue: "active",
        },
    },
    {
        tableName: "users",
    }
);

module.exports = User;