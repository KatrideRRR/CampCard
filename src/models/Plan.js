const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Plan = sequelize.define(
    "Plan",
    {
        id: {
            type: DataTypes.BIGINT.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },

        code: {
            type: DataTypes.STRING(50),
            allowNull: false,
            unique: true,
        },

        name: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },

        topup_amount_kopecks: {
            type: DataTypes.BIGINT,
            allowNull: false,
        },

        bonus_amount_kopecks: {
            type: DataTypes.BIGINT,
            allowNull: false,
            defaultValue: 0,
        },

        bonus_valid_days: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: true,
        },

        is_active: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
        },

        sort_order: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
        },
    },
    {
        tableName: "plans",
    }
);

module.exports = Plan;