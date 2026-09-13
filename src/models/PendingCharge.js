const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const PendingCharge = sequelize.define(
    "PendingCharge",
    {
        id: {
            type: DataTypes.BIGINT.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },

        employee_user_id: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: false,
        },

        qr_token_id: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: false,
        },

        location_id: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: false,
        },

        amount_kopecks: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },

        status: {
            type: DataTypes.ENUM(
                "active",
                "completed",
                "cancelled"
            ),
            allowNull: false,
            defaultValue: "active",
        },

        expires_at: {
            type: DataTypes.DATE,
            allowNull: false,
        },
    },
    {
        tableName: "pending_charges",

        indexes: [
            {
                fields: [
                    "employee_user_id",
                    "status",
                ],
            },
        ],
    }
);

module.exports = PendingCharge;