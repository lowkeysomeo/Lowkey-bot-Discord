const fs = require("node:fs");

const {
    createCanvas,
    loadImage,
    GlobalFonts
} = require("@napi-rs/canvas");


function loadFonts() {
    const fonts = [
        {
            path: "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            name: "VNL"
        },
        {
            path: "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
            name: "VNL Bold"
        }
    ];

    for (const font of fonts) {
        try {
            if (fs.existsSync(font.path)) {
                GlobalFonts.registerFromPath(
                    font.path,
                    font.name
                );
            }
        } catch {}
    }
}

loadFonts();


const REGULAR_FONT =
    '"VNL", "DejaVu Sans", Arial, sans-serif';

const BOLD_FONT =
    '"VNL Bold", "DejaVu Sans", Arial, sans-serif';


function roundRect(
    ctx,
    x,
    y,
    width,
    height,
    radius
) {
    const r =
        Math.min(
            radius,
            width / 2,
            height / 2
        );

    ctx.beginPath();

    ctx.moveTo(
        x + r,
        y
    );

    ctx.lineTo(
        x + width - r,
        y
    );

    ctx.quadraticCurveTo(
        x + width,
        y,
        x + width,
        y + r
    );

    ctx.lineTo(
        x + width,
        y + height - r
    );

    ctx.quadraticCurveTo(
        x + width,
        y + height,
        x + width - r,
        y + height
    );

    ctx.lineTo(
        x + r,
        y + height
    );

    ctx.quadraticCurveTo(
        x,
        y + height,
        x,
        y + height - r
    );

    ctx.lineTo(
        x,
        y + r
    );

    ctx.quadraticCurveTo(
        x,
        y,
        x + r,
        y
    );

    ctx.closePath();
}


function drawStar(
    ctx,
    cx,
    cy,
    outerRadius,
    innerRadius
) {
    let rotation =
        -Math.PI / 2;

    ctx.beginPath();

    for (
        let i = 0;
        i < 10;
        i++
    ) {
        const radius =
            i % 2 === 0
                ? outerRadius
                : innerRadius;

        const x =
            cx +
            Math.cos(rotation) *
                radius;

        const y =
            cy +
            Math.sin(rotation) *
                radius;

        if (i === 0) {
            ctx.moveTo(
                x,
                y
            );
        } else {
            ctx.lineTo(
                x,
                y
            );
        }

        rotation +=
            Math.PI / 5;
    }

    ctx.closePath();
}


function cutText(
    ctx,
    text,
    maxWidth
) {
    let result =
        text;

    while (
        ctx.measureText(result)
            .width >
            maxWidth &&
        result.length > 3
    ) {
        result =
            result.slice(
                0,
                -1
            );
    }

    if (
        result !== text
    ) {
        result += "...";
    }

    return result;
}


async function createVoiceLeaderboardCard(
    rows,
    guildName
) {
    const width = 1500;
    const height = 900;


    const canvas =
        createCanvas(
            width,
            height
        );


    const ctx =
        canvas.getContext(
            "2d"
        );


    // Background
    const bg =
        ctx.createLinearGradient(
            0,
            0,
            width,
            height
        );

    bg.addColorStop(
        0,
        "#330303"
    );

    bg.addColorStop(
        0.4,
        "#700808"
    );

    bg.addColorStop(
        0.75,
        "#8F0C0C"
    );

    bg.addColorStop(
        1,
        "#3A0303"
    );


    ctx.fillStyle = bg;

    ctx.fillRect(
        0,
        0,
        width,
        height
    );


    // Star
    ctx.save();

    ctx.globalAlpha =
        0.08;

    ctx.fillStyle =
        "#FFD75A";

    drawStar(
        ctx,
        1260,
        190,
        175,
        70
    );

    ctx.fill();

    ctx.restore();


    // Border
    ctx.strokeStyle =
        "#E8B94B";

    ctx.lineWidth = 3;


    roundRect(
        ctx,
        18,
        18,
        width - 36,
        height - 36,
        24
    );

    ctx.stroke();


    // Header
    ctx.fillStyle =
        "#FFD75A";

    ctx.font =
        `34px ${BOLD_FONT}`;

    ctx.fillText(
        "VIETNAM LEGACY",
        70,
        75
    );


    ctx.fillStyle =
        "#FFF0C2";

    ctx.font =
        `46px ${BOLD_FONT}`;

    ctx.fillText(
        "TOP 10 VOICE LEVEL",
        70,
        135
    );


    ctx.fillStyle =
        "#D9BA79";

    ctx.font =
        `19px ${REGULAR_FONT}`;

    ctx.fillText(
        `${guildName} • Những thành viên hoạt động Voice nổi bật`,
        70,
        172
    );


    // Table header
    const tableX = 65;
    const tableY = 215;

    const tableWidth =
        1370;


    ctx.fillStyle =
        "rgba(35,3,3,0.85)";


    roundRect(
        ctx,
        tableX,
        tableY,
        tableWidth,
        55,
        12
    );

    ctx.fill();


    ctx.fillStyle =
        "#D8B875";

    ctx.font =
        `17px ${BOLD_FONT}`;


    ctx.fillText(
        "#",
        95,
        250
    );

    ctx.fillText(
        "THÀNH VIÊN",
        185,
        250
    );

    ctx.fillText(
        "LEVEL",
        850,
        250
    );

    ctx.fillText(
        "VOICE XP",
        1020,
        250
    );

    ctx.fillText(
        "THỜI GIAN",
        1220,
        250
    );


    const rowHeight =
        58;


    for (
        let i = 0;
        i < rows.length;
        i++
    ) {
        const row =
            rows[i];


        const y =
            tableY +
            70 +
            i * rowHeight;


        if (
            i === 0
        ) {
            ctx.fillStyle =
                "rgba(170,110,20,0.28)";
        } else if (
            i === 1
        ) {
            ctx.fillStyle =
                "rgba(180,180,180,0.14)";
        } else if (
            i === 2
        ) {
            ctx.fillStyle =
                "rgba(150,75,25,0.20)";
        } else {
            ctx.fillStyle =
                "rgba(30,3,3,0.62)";
        }


        roundRect(
            ctx,
            tableX,
            y,
            tableWidth,
            48,
            10
        );

        ctx.fill();


        // Rank
        ctx.fillStyle =
            i < 3
                ? "#FFD75A"
                : "#D9BA79";


        ctx.font =
            i < 3
                ? `23px ${BOLD_FONT}`
                : `18px ${BOLD_FONT}`;


        ctx.fillText(
            `#${i + 1}`,
            90,
            y + 32
        );


        // Avatar
        try {
            const response =
                await fetch(
                    row.avatarURL
                );

            if (
                response.ok
            ) {
                const buffer =
                    Buffer.from(
                        await response
                            .arrayBuffer()
                    );


                const avatar =
                    await loadImage(
                        buffer
                    );


                ctx.save();

                ctx.beginPath();

                ctx.arc(
                    150,
                    y + 24,
                    18,
                    0,
                    Math.PI * 2
                );

                ctx.clip();


                ctx.drawImage(
                    avatar,
                    132,
                    y + 6,
                    36,
                    36
                );

                ctx.restore();
            }
        } catch {}


        // Name
        ctx.fillStyle =
            "#FFF0C2";

        ctx.font =
            `19px ${BOLD_FONT}`;


        ctx.fillText(
            cutText(
                ctx,
                row.displayName,
                560
            ),
            185,
            y + 31
        );


        // Level
        ctx.fillStyle =
            "#FFE29A";

        ctx.font =
            `19px ${BOLD_FONT}`;


        ctx.fillText(
            `${row.level}`,
            865,
            y + 31
        );


        // XP
        ctx.fillText(
            Number(
                row.totalXp
            ).toLocaleString(
                "vi-VN"
            ),
            1020,
            y + 31
        );


        // Time
        const totalMinutes =
            Number(
                row.minutes
            ) || 0;


        const hours =
            Math.floor(
                totalMinutes / 60
            );


        const minutes =
            totalMinutes % 60;


        const timeText =
            hours > 0
                ? `${hours}g ${minutes}p`
                : `${minutes} phút`;


        ctx.fillText(
            timeText,
            1220,
            y + 31
        );
    }


    // Footer
    ctx.fillStyle =
        "#D9BA79";

    ctx.font =
        `17px ${REGULAR_FONT}`;


    ctx.fillText(
        "Voice cùng mọi người để tăng XP và kết nối nhiều hơn nhé!",
        70,
        845
    );


    return canvas.toBuffer(
        "image/png"
    );
}


module.exports = {
    createVoiceLeaderboardCard
};