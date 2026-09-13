const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const BonusLot = sequelize.define(
    "BonusLot",
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

        source_transaction_id: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: true,
        },

        original_amount_kopecks: {
            type: DataTypes.BIGINT,
            allowNull: false,
        },

        remaining_amount_kopecks: {
            type: DataTypes.BIGINT,
            allowNull: false,
        },

        expires_at: {
            type: DataTypes.DATE,
            allowNull: false,
        },

        status: {
            type: DataTypes.ENUM(
                "active",
                "used",
                "expired"
            ),
            allowNull: false,
            defaultValue: "active",
        },
    },
    {
        tableName: "bonus_lots",

        indexes: [
            {
                fields: [
                    "wallet_id",
                    "status",
                    "expires_at",
                ],
            },
        ],
    }
);

module.exports = BonusLot;