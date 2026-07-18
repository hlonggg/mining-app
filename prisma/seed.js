const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Config mặc định — chỉnh trong trang admin, không cần sửa code
  const defaultConfig = {
    COIN_TO_VND: '0.05',         // 1 coin = 0,05 VND
    MINING_RATE_PER_SECOND: '0.1', // tốc độ đào coin/giây — chỉnh trong trang admin, không cần sửa code
    MIN_WITHDRAW_COIN: '5000',   // số coin tối thiểu để rút
    MINING_SESSION_HOURS: '8',   // thời lượng 1 phiên đào mặc định
    AD_EXTEND_MINUTES: '30',     // mỗi ad xem xong cộng thêm bao nhiêu phút
    MAX_EXTEND_HOURS: '4',       // giới hạn tối đa được cộng thêm / phiên (chặn spam ads vô hạn)
    // Danh sách Block ID quảng cáo Adsgram — luân phiên (round-robin) giữa các ID này để tăng fill rate.
    // Thay bằng blockId thật lấy tại https://partner.adsgram.ai — có thể để nhiều ID nếu bạn tạo
    // nhiều "Block" khác nhau trong tài khoản Adsgram (mỗi Block có thể set định dạng/vị trí khác nhau).
    AD_BLOCK_IDS: JSON.stringify(['your-block-id-1', 'your-block-id-2']),
    // Dán NGUYÊN đoạn <script> thật lấy từ dashboard Monetag của bạn (Ad Integration > SDK).
    // Ví dụ dạng: <script src="https://xxx.com/sdk.js" data-zone="123456" data-sdk="show_123456"></script>
    // Để trống nếu chưa đăng ký, hệ thống sẽ tự dùng Adsgram làm nguồn dự phòng cho tới khi bạn điền.
    MONETAG_SCRIPT_TAG: '',
    // Widget ID Adexium theo từng định dạng — tạo tại publisher.adexium.io mục "Create Widget".
    // Để trống nếu chưa có, hệ thống tự bỏ qua và dùng nguồn khác trong chuỗi dự phòng.
    ADEXIUM_INTERSTITIAL_ID: '',
    ADEXIUM_PUSHLIKE_ID: '',
  };

  for (const [key, value] of Object.entries(defaultConfig)) {
    await prisma.config.upsert({
      where: { key },
      update: {},
      create: { key, value },
    });
  }

  // Vài task mẫu
  const tasks = [
    { title: 'Tham gia kênh Telegram chính', type: 'join_channel', rewardCoins: 500, link: 'https://t.me/your_channel' },
    { title: 'Theo dõi Facebook Fanpage', type: 'follow', rewardCoins: 300, link: 'https://facebook.com/your_page' },
    { title: 'Xem 1 video quảng cáo', type: 'watch_ad', rewardCoins: 200, link: null },
  ];

  for (const t of tasks) {
    const exists = await prisma.task.findFirst({ where: { title: t.title } });
    if (!exists) await prisma.task.create({ data: t });
  }

  console.log('Seed xong.');
}

main().finally(() => prisma.$disconnect());
