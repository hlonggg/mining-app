const express = require('express');
const router = express.Router();
const { getConfig } = require('../src/lib');

// Không cần đăng nhập — chỉ trả về danh sách blockId để frontend luân phiên hiển thị ads.
// Không phải dữ liệu nhạy cảm (blockId là public theo thiết kế của Adsgram).
router.get('/ad-config', async (req, res) => {
  const raw = await getConfig('AD_BLOCK_IDS', '[]');
  let blockIds = [];
  try {
    blockIds = JSON.parse(raw);
  } catch (e) {
    blockIds = [];
  }
  const adexiumWidgetId = await getConfig('ADEXIUM_WIDGET_ID', '');
  res.json({ blockIds: Array.isArray(blockIds) ? blockIds : [], adexiumWidgetId });
});

module.exports = router;
