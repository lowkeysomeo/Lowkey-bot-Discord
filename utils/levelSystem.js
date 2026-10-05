const fs = require("node:fs");
const path = require("node:path");

const dataPath = path.join(__dirname, "../data/levels.json");

function ensureFile() {
    const dataDir = path.dirname(dataPath);

    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    if (!fs.existsSync(dataPath)) {
        fs.writeFileSync(dataPath, "{}");
    }
}

function loadData() {
    ensureFile();

    try {
        return JSON.parse(
            fs.readFileSync(dataPath, "utf8")
        );
    } catch (error) {
        console.error("Lỗi đọc levels.json:", error);
        return {};
    }
}

function saveData(data) {
    ensureFile();

    fs.writeFileSync(
        dataPath,
        JSON.stringify(data, null, 4)
    );
}

function getKey(guildId, userId) {
    return `${guildId}:${userId}`;
}

function getRequiredXp(level) {
    return 100 + ((level - 1) * 50);
}

function getProfile(guildId, userId) {
    const data = loadData();
    const key = getKey(guildId, userId);

    if (!data[key]) {
        return {
            level: 1,
            xp: 0,
            totalXp: 0
        };
    }

    return data[key];
}

function addXp(guildId, userId, amount) {
    const data = loadData();
    const key = getKey(guildId, userId);

    if (!data[key]) {
        data[key] = {
            level: 1,
            xp: 0,
            totalXp: 0
        };
    }

    const profile = data[key];

    profile.xp += amount;
    profile.totalXp += amount;

    let levelUps = 0;

    while (
        profile.xp >= getRequiredXp(profile.level)
    ) {
        profile.xp -= getRequiredXp(profile.level);
        profile.level++;
        levelUps++;
    }

    saveData(data);

    return {
        ...profile,
        levelUps
    };
}

function getLeaderboard(guildId, limit = 10) {
    const data = loadData();

    return Object.entries(data)
        .filter(([key]) =>
            key.startsWith(`${guildId}:`)
        )
        .map(([key, value]) => ({
            userId: key.split(":")[1],
            ...value
        }))
        .sort(
            (a, b) => b.totalXp - a.totalXp
        )
        .slice(0, limit);
}

module.exports = {
    getProfile,
    addXp,
    getRequiredXp,
    getLeaderboard
};