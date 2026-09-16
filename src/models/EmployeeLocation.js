const {
    DataTypes,
} = require("sequelize");

const sequelize =
    require("../config/database");


const EmployeeLocation =
    sequelize.define(
        "EmployeeLocation",
        {
            id: {
                type:
                DataTypes.BIGINT.UNSIGNED,

                autoIncrement: true,
                primaryKey: true,
            },

            user_id: {
                type:
                DataTypes.BIGINT.UNSIGNED,

                allowNull: false,
            },

            location_id: {
                type:
                DataTypes.BIGINT.UNSIGNED,

                allowNull: false,
            },

            is_active: {
                type:
                DataTypes.BOOLEAN,

                allowNull: false,
                defaultValue: true,
            },

            /*
             * На какой точке сотрудник
             * работает прямо сейчас.
             *
             * Назначений может быть несколько,
             * current должна быть одна.
             */
            is_current: {
                type:
                DataTypes.BOOLEAN,

                allowNull: false,
                defaultValue: false,
            },
        },
        {
            tableName:
                "employee_locations",

            indexes: [
                {
                    name:
                        "uniq_employee_location",

                    unique:
                        true,

                    fields: [
                        "user_id",
                        "location_id",
                    ],
                },

                {
                    name:
                        "idx_employee_current_location",

                    fields: [
                        "user_id",
                        "is_active",
                        "is_current",
                    ],
                },
            ],
        }
    );


module.exports =
    EmployeeLocation;