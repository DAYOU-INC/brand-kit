// acme 设计令牌：由 brand-kit build 从 acme/tokens.json 生成，不要手改（acme_tokens.dart）

import 'dart:ui';

class AcmeTokens {
  AcmeTokens._();

  /// 强调色（焦糖橙）。价格、关键数字、小面积强调。白字在上 4.05:1，只用于大字。
  /// 状态：current；渠道：web、app、marketing、print；出处：示例：产品渲染图旋钮取色（众数）
  static const colorBrandAccent = Color(0xFFC8611E);

  /// 奶油色。浅色页面底色、卡片底色。
  /// 状态：current；渠道：web、app、marketing、print；出处：示例：详情页底色取色
  static const colorBrandCream = Color(0xFFF4EDE4);

  /// 深色文字和深色底。
  /// 状态：current；渠道：web、app、marketing、print；出处：示例：详情页正文取色
  static const colorBrandInk = Color(0xFF14181C);

  /// 主色（深青）。大面积底色、标题、按钮。白字在上 9.08:1。
  /// 状态：confirmed；渠道：web、app、marketing、print；出处：示例：VI 手册第 2 页色块取色
  static const colorBrandPrimary = Color(0xFF1F4E5F);

  /// 网站主色，指向品牌主色。
  /// 状态：current；渠道：web、app；出处：示例：网站样式表
  static const colorDigitalWebPrimary = Color(0xFF1F4E5F);

  /// 白色。
  /// 状态：current；渠道：web、app、marketing、print；出处：通用值
  static const colorNeutralWhite = Color(0xFFFFFFFF);

  /// 标题和正文字体（拉丁）。
  /// 状态：current；渠道：web、app、marketing；出处：示例：详情页 PSD 文字图层；Google Fonts，SIL OFL 1.1
  static const fontDisplay = "Source Sans 3";

  /// 网站和 App 卡片圆角。
  /// 状态：current；渠道：web、app；出处：示例：网站样式表
  static const radiusCard = 12.00;
}
