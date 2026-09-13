const {
    Location,
} = require("../models");

const DEFAULT_LOCATIONS = [
    {
        code: "adalet",
        name: "Адалет",
    },

    {
        code: "balaklavskaya",
        name: "Балаклавская",
    },
];

async function seedLocations() {
    for (const location of DEFAULT_LOCATIONS) {
        await Location.findOrCreate({
            where: {
                code: location.code,
            },

            defaults: {
                ...location,
                is_active: true,
            },
        });
    }
}

async function getLocationByCode(code) {
    return Location.findOne({
        where: {
            code,
            is_active: true,
        },
    });
}

module.exports = {
    seedLocations,
    getLocationByCode,
};