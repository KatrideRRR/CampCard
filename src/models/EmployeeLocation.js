const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const EmployeeLocation = sequelize.define(
    "EmployeeLocation",
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

        location_id: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: false,
        },

        is_active: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
        },
    },
    {
        tableName: "employee_locations",
    }
);

module.exports = EmployeeLocation;