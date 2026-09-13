const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Wallet = sequelize.define(
    "Wallet",
    {
        id: {
            type: DataTypes.BIGINT.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },

        user_id: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: false,
            unique: true,
        },

        paid_balance_kopecks: {
            type: DataTypes.BIGINT,
            allowNull: false,
            defaultValue: 0,
        },

        bonus_balance_kopecks: {
            type: DataTypes.BIGINT,
            allowNull: false,
            defaultValue: 0,
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
        tableName: "wallets",
    }
);

module.exports = Wallet;