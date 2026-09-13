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

User.hasOne(EmployeeLocation, {
    foreignKey: "user_id",
    as: "employeeLocation",
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
};