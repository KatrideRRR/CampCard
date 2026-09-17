const User = require("./User");
const Wallet = require("./Wallet");
const WalletTransaction = require("./WalletTransaction");
const Plan = require("./Plan");
const BonusLot = require("./BonusLot");
const Location = require("./Location");
const EmployeeLocation = require("./EmployeeLocation");
const QrToken = require("./QrToken");
const PendingCharge = require("./PendingCharge");
const Redemption = require("./Redemption");
const TopupQrToken = require("./TopupQrToken");
const TopupPayment = require("./TopupPayment");
const BonusExpiryNotification = require("./BonusExpiryNotification");
const SberTopupPayment = require("./SberTopupPayment");
const EmployeeInvite = require("./EmployeeInvite");

User.hasOne(Wallet, {
    foreignKey: "user_id",
    as: "wallet",
    onDelete: "CASCADE",
});

Wallet.belongsTo(User, {
    foreignKey: "user_id",
    as: "user",
});

Wallet.hasMany(WalletTransaction, {
    foreignKey: "wallet_id",
    as: "transactions",
    onDelete: "CASCADE",
});

WalletTransaction.belongsTo(Wallet, {
    foreignKey: "wallet_id",
    as: "wallet",
});

Wallet.hasMany(BonusLot, {
    foreignKey: "wallet_id",
    as: "bonusLots",
    onDelete: "CASCADE",
});

BonusLot.belongsTo(Wallet, {
    foreignKey: "wallet_id",
    as: "wallet",
});

WalletTransaction.hasMany(BonusLot, {
    foreignKey: "source_transaction_id",
    as: "bonusLots",
});

User.hasMany(EmployeeLocation, {
    foreignKey: "user_id",
    as: "employeeLocations",
});

EmployeeLocation.belongsTo(User, {
    foreignKey: "user_id",
    as: "user",
});

Location.hasMany(EmployeeLocation, {
    foreignKey: "location_id",
    as: "employees",
});

EmployeeLocation.belongsTo(Location, {
    foreignKey: "location_id",
    as: "location",
});


Wallet.hasMany(QrToken, {
    foreignKey: "wallet_id",
    as: "qrTokens",
});

Location.hasMany(Redemption, {
    foreignKey: "location_id",
    as: "redemptions",
});

Redemption.belongsTo(Location, {
    foreignKey: "location_id",
    as: "location",
});


Wallet.hasMany(Redemption, {
    foreignKey: "wallet_id",
    as: "redemptions",
});

Redemption.belongsTo(Wallet, {
    foreignKey: "wallet_id",
    as: "wallet",
});

BonusLot.belongsTo(WalletTransaction, {
    foreignKey: "source_transaction_id",
    as: "sourceTransaction",
});

QrToken.belongsTo(Wallet, {
    foreignKey: "wallet_id",
    as: "wallet",
});

PendingCharge.belongsTo(QrToken, {
    foreignKey: "qr_token_id",
    as: "qrToken",
});

PendingCharge.belongsTo(Location, {
    foreignKey: "location_id",
    as: "location",
});

PendingCharge.belongsTo(User, {
    foreignKey: "employee_user_id",
    as: "employee",
});

Redemption.belongsTo(User, {
    foreignKey: "employee_user_id",
    as: "employee",
});

Redemption.belongsTo(QrToken, {
    foreignKey: "qr_token_id",
    as: "qrToken",
});

Wallet.hasMany(
    TopupQrToken,
    {
        foreignKey:
            "wallet_id",

        as:
            "topupQrTokens",
    }
);

TopupQrToken.belongsTo(
    Wallet,
    {
        foreignKey:
            "wallet_id",

        as:
            "wallet",
    }
);


TopupQrToken.belongsTo(
    User,
    {
        foreignKey:
            "claimed_by_user_id",

        as:
            "claimedBy",
    }
);


Wallet.hasMany(
    TopupPayment,
    {
        foreignKey:
            "wallet_id",

        as:
            "topups",
    }
);

TopupPayment.belongsTo(
    Wallet,
    {
        foreignKey:
            "wallet_id",

        as:
            "wallet",
    }
);


Plan.hasMany(
    TopupPayment,
    {
        foreignKey:
            "plan_id",

        as:
            "topups",
    }
);

TopupPayment.belongsTo(
    Plan,
    {
        foreignKey:
            "plan_id",

        as:
            "plan",
    }
);


Location.hasMany(
    TopupPayment,
    {
        foreignKey:
            "location_id",

        as:
            "topups",
    }
);

TopupPayment.belongsTo(
    Location,
    {
        foreignKey:
            "location_id",

        as:
            "location",
    }
);


User.hasMany(
    TopupPayment,
    {
        foreignKey:
            "employee_user_id",

        as:
            "employeeTopups",
    }
);

TopupPayment.belongsTo(
    User,
    {
        foreignKey:
            "employee_user_id",

        as:
            "employee",
    }
);


TopupPayment.belongsTo(
    TopupQrToken,
    {
        foreignKey:
            "topup_qr_token_id",

        as:
            "qrToken",
    }
);

Wallet.hasMany(
    BonusExpiryNotification,
    {
        foreignKey:
            "wallet_id",

        as:
            "bonusExpiryNotifications",
    }
);

BonusExpiryNotification.belongsTo(
    Wallet,
    {
        foreignKey:
            "wallet_id",

        as:
            "wallet",
    }
);

Wallet.hasMany(
    SberTopupPayment,
    {
        foreignKey:
            "wallet_id",

        as:
            "sberTopups",
    }
);

SberTopupPayment.belongsTo(
    Wallet,
    {
        foreignKey:
            "wallet_id",

        as:
            "wallet",
    }
);


Plan.hasMany(
    SberTopupPayment,
    {
        foreignKey:
            "plan_id",

        as:
            "sberTopups",
    }
);

SberTopupPayment.belongsTo(
    Plan,
    {
        foreignKey:
            "plan_id",

        as:
            "plan",
    }
);

User.hasMany(
    EmployeeInvite,
    {
        foreignKey:
            "created_by_user_id",

        as:
            "createdEmployeeInvites",
    }
);

EmployeeInvite.belongsTo(
    User,
    {
        foreignKey:
            "created_by_user_id",

        as:
            "creator",
    }
);


EmployeeInvite.belongsTo(
    User,
    {
        foreignKey:
            "used_by_user_id",

        as:
            "usedBy",
    }
);

module.exports = {
    User,
    Wallet,
    WalletTransaction,
    Plan,
    BonusLot,
    Location,
    EmployeeLocation,
    QrToken,
    PendingCharge,
    Redemption,
    TopupQrToken,
    TopupPayment,
    BonusExpiryNotification,
    SberTopupPayment,
    EmployeeInvite,
};