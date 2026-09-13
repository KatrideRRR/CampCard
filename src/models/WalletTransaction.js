const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const WalletTransaction = sequelize.define(
    "WalletTransaction",
    {
        id: {
            type: DataTypes.BIGINT.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },

        wallet_id: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: false,
        },

        type: {
            type: DataTypes.ENUM(
                "topup",
                "bonus",
                "purchase",
                "refund",
                "bonus_expired",
                "adjustment"
            ),
            allowNull: false,
        },

        paid_delta_kopecks: {
            type: DataTypes.BIGINT,
            allowNull: false,
            defaultValue: 0,
        },

        bonus_delta_kopecks: {
            type: DataTypes.BIGINT,
            allowNull: false,
            defaultValue: 0,
        },

        paid_balance_after_kopecks: {
            type: DataTypes.BIGINT,
            allowNull: false,
        },

        bonus_balance_after_kopecks: {
            type: DataTypes.BIGINT,
            allowNull: false,
        },

        external_ref: {
            type: DataTypes.STRING(255),
            allowNull: true,
            unique: true,
        },

        description: {
            type: DataTypes.STRING(500),
            allowNull: true,
        },

        metadata: {
            type: DataTypes.JSON,
            allowNull: true,
        },
    },
    {
        tableName: "wallet_transactions",
        indexes: [
            {
                fields: ["wallet_id", "created_at"],
            },
            {
                fields: ["type"],
            },
        ],
    }
);

module.exports = WalletTransaction;