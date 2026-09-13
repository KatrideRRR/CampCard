const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Location = sequelize.define(
    "Location",
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

        is_active: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
        },
    },
    {
        tableName: "locations",
    }
);

module.exports = Location;