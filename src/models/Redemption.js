const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Redemption = sequelize.define(
    "Redemption",
    {
        id: {
            type: DataTypes.BIGINT.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },

        event_id: {
            type: DataTypes.STRING(100),
            allowNull: false,
            unique: true,
        },

        wallet_id: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: false,
        },

        location_id: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: false,
        },

        employee_user_id: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: false,
        },

        qr_token_id: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: false,
            unique: true,
        },

        wallet_transaction_id: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: false,
        },

        amount_kopecks: {
            type: DataTypes.BIGINT,
            allowNull: false,
        },

        paid_amount_kopecks: {
            type: DataTypes.BIGINT,
            allowNull: false,
        },

        bonus_amount_kopecks: {
            type: DataTypes.BIGINT,
            allowNull: false,
        },

        business_cash_status: {
            type: DataTypes.ENUM(
                "pending",
                "sent",
                "failed"
            ),
            allowNull: false,
            defaultValue: "pending",
        },

        business_cash_attempts: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },

        business_cash_last_error: {
            type: DataTypes.TEXT,
            allowNull: true,
        },

        status: {
            type: DataTypes.ENUM(
                "completed",
                "refunded"
            ),
            allowNull: false,
            defaultValue: "completed",
        },
    },
    {
        tableName: "redemptions",

        indexes: [
            {
                fields: [
                    "location_id",
                    "created_at",
                ],
            },
            {
                fields: [
                    "business_cash_status",
                ],
            },
        ],
    }
);

module.exports = Redemption;