-- 新增裝備與服務的測試資料
INSERT INTO nf_items (name, category, price_weekday, price_holiday, total_quantity, sort_order)
VALUES 
  ('四人帳篷租借 (自行搭設)', 'equipment', 1000, 1000, 30, 21),
  ('專人帳篷代搭服務 (單次)', 'service', 500, 500, 30, 22),
  ('客廳帳租借 (自行搭設)', 'equipment', 800, 800, 20, 23),
  ('專人客廳帳代搭服務 (單次)', 'service', 200, 200, 20, 24),
  ('豪華免搭帳 (含營位與寢具)', 'campsite', 2500, 3500, 10, 25),
  ('頂級海陸烤肉組代訂 (四人份)', 'service', 2000, 2000, 10, 26),
  ('營區特製晚餐 (單人份)', 'service', 450, 450, 100, 27);
