const fs = require("node:fs");
const path = require("node:path");

const dataPath = path.join(
    __dirname,
    "../data/voiceLevels.json"
);

function ensureFile() {
    const dir = path.dirname(dataPath);

    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    if (!fs.existsSync(dataPath)) {
        fs.writeFileSync(dataPath, "{}");
    }
}

function loadData() {
    ensureFile();

    try {
        const content = fs
            .readFileSync(dataPath, "utf8")
            .trim();

        if (!content) return {};

        return JSON.parse(content);
    } catch (error) {
        console.error(
            "❌ Lỗi đọc voiceLevels.json:",
            error
        );

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

function getRequiredVoiceXp(level) {
    return 100 + ((level - 1) * 50);
}

function getVoiceProfile(guildId, userId) {
    const data = loadData();
    const key = getKey(guildId, userId);

    return data[key] || {
        level: 1,
        xp: 0,
        totalXp: 0,
        minutes: 0
    };
}

function addVoiceXp(guildId, userId, amount) {
    const data = loadData();
    const key = getKey(guildId, userId);

    if (!data[key]) {
        data[key] = {
            level: 1,
            xp: 0,
            totalXp: 0,
            minutes: 0
        };
    }

    const profile = data[key];

    profile.xp += amount;
    profile.totalXp += amount;
    profile.minutes += 1;

    let levelUps = 0;

    while (
        profile.xp >=
        getRequiredVoiceXp(profile.level)
    ) {
        profile.xp -=
            getRequiredVoiceXp(profile.level);

        profile.level++;
        levelUps++;
    }

    saveData(data);

    return {
        ...profile,
        levelUps
    };
}

function getVoiceLeaderboard(guildId, limit = 10) {
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
    addVoiceXp,
    getVoiceProfile,
    getRequiredVoiceXp,
    getVoiceLeaderboard
};