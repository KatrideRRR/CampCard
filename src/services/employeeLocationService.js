const sequelize =
    require("../config/database");

const {
    EmployeeLocation,
    Location,
} = require("../models");


async function getCurrentEmployeeLocation({
                                              userId,
                                              transaction = null,
                                          }) {
    const employeeLocation =
        await EmployeeLocation.findOne({
            where: {
                user_id:
                userId,

                is_active:
                    true,

                is_current:
                    true,
            },

            transaction,
        });


    if (!employeeLocation) {
        return null;
    }


    const location =
        await Location.findByPk(
            employeeLocation.location_id,
            {
                transaction,
            }
        );


    if (
        !location ||
        !location.is_active
    ) {
        return null;
    }


    return {
        employeeLocation,
        location,
    };
}


async function getEmployeeLocations({
                                        userId,
                                        transaction = null,
                                    }) {
    const assignments =
        await EmployeeLocation.findAll({
            where: {
                user_id:
                userId,

                is_active:
                    true,
            },

            order: [
                ["is_current", "DESC"],
                ["id", "ASC"],
            ],

            transaction,
        });


    const result = [];

    for (
        const assignment
        of assignments
        ) {
        const location =
            await Location.findByPk(
                assignment.location_id,
                {
                    transaction,
                }
            );


        if (
            location &&
            location.is_active
        ) {
            result.push({
                assignment,
                location,
            });
        }
    }


    return result;
}


async function employeeHasLocation({
                                       userId,
                                       locationId,
                                       transaction = null,
                                   }) {
    const assignment =
        await EmployeeLocation.findOne({
            where: {
                user_id:
                userId,

                location_id:
                locationId,

                is_active:
                    true,
            },

            transaction,
        });


    return Boolean(
        assignment
    );
}


async function setCurrentEmployeeLocation({
                                              userId,
                                              locationId,
                                          }) {
    return sequelize.transaction(
        async (transaction) => {

            const assignment =
                await EmployeeLocation.findOne({
                    where: {
                        user_id:
                        userId,

                        location_id:
                        locationId,

                        is_active:
                            true,
                    },

                    transaction,

                    lock:
                    transaction
                        .LOCK
                        .UPDATE,
                });


            if (!assignment) {
                throw new Error(
                    "EMPLOYEE_LOCATION_NOT_ASSIGNED"
                );
            }


            await EmployeeLocation.update(
                {
                    is_current:
                        false,
                },
                {
                    where: {
                        user_id:
                        userId,

                        is_active:
                            true,
                    },

                    transaction,
                }
            );


            await assignment.update(
                {
                    is_current:
                        true,
                },
                {
                    transaction,
                }
            );


            const location =
                await Location.findByPk(
                    locationId,
                    {
                        transaction,
                    }
                );


            if (!location) {
                throw new Error(
                    "LOCATION_NOT_FOUND"
                );
            }


            return {
                assignment,
                location,
            };
        }
    );
}


module.exports = {
    getCurrentEmployeeLocation,
    getEmployeeLocations,
    employeeHasLocation,
    setCurrentEmployeeLocation,
};