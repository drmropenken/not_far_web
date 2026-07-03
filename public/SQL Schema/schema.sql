


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."crowding_level" AS ENUM (
    'empty',
    'comfortable',
    'full'
);


ALTER TYPE "public"."crowding_level" OWNER TO "postgres";


CREATE TYPE "public"."owner_business_status" AS ENUM (
    'pending',
    'verified',
    'suspended'
);


ALTER TYPE "public"."owner_business_status" OWNER TO "postgres";


CREATE TYPE "public"."spot_category" AS ENUM (
    'free',
    'paid',
    'wild',
    'temple'
);


ALTER TYPE "public"."spot_category" OWNER TO "postgres";


CREATE TYPE "public"."weather_status" AS ENUM (
    'sunny',
    'cloudy',
    'rainy'
);


ALTER TYPE "public"."weather_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_booking_transaction"("p_order" "jsonb", "p_order_items" "jsonb", "p_inventory_updates" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_order_id UUID;
  v_update JSONB;
  v_item_id UUID;
  v_date DATE;
  v_qty INT;
  v_total_qty INT;
  v_current_booked INT;
  v_item_name TEXT;
  v_existing_inv_id UUID;
BEGIN
  -- 1. 檢查並鎖定庫存 (Lock Inventory)
  FOR v_update IN SELECT * FROM jsonb_array_elements(p_inventory_updates)
  LOOP
    v_item_id := (v_update->>'item_id')::UUID;
    v_date := (v_update->>'date')::DATE;
    v_qty := (v_update->>'quantity')::INT;

    -- 取得項目總數和名稱
    SELECT total_quantity, name INTO v_total_qty, v_item_name 
    FROM nf_items WHERE id = v_item_id;

    -- 取得當天的庫存紀錄，並加上 FOR UPDATE 強制鎖定這行資料，不讓別人同時改
    SELECT id, booked_quantity INTO v_existing_inv_id, v_current_booked
    FROM nf_inventory 
    WHERE item_id = v_item_id AND date = v_date
    FOR UPDATE;

    -- 如果是全新的日期，庫存就是 0
    IF NOT FOUND THEN
      v_current_booked := 0;
    END IF;

    -- 檢查是否超賣！
    IF (v_current_booked + v_qty) > v_total_qty THEN
      RAISE EXCEPTION '庫存不足: % 在 % 的剩餘數量不夠，已被其他客人搶先一步。', v_item_name, v_date;
    END IF;

    -- 更新或新增庫存
    IF v_existing_inv_id IS NOT NULL THEN
      UPDATE nf_inventory 
      SET booked_quantity = booked_quantity + v_qty
      WHERE id = v_existing_inv_id;
    ELSE
      INSERT INTO nf_inventory (item_id, date, booked_quantity)
      VALUES (v_item_id, v_date, v_qty);
    END IF;
  END LOOP;

  -- 2. 新增訂單
  INSERT INTO nf_orders (
    order_no, check_in_date, check_out_date, customer_name, customer_phone, 
    license_plate, notes, total_amount, discount_code, discount_amount, deposit_amount, 
    status, payment_method, virtual_account, line_user_id, camp_id
  )
  VALUES (
    p_order->>'order_no', 
    (p_order->>'check_in_date')::DATE, 
    (p_order->>'check_out_date')::DATE, 
    p_order->>'customer_name', 
    p_order->>'customer_phone', 
    p_order->>'license_plate', 
    p_order->>'notes', 
    (p_order->>'total_amount')::INT, 
    p_order->>'discount_code', 
    (p_order->>'discount_amount')::INT, 
    COALESCE((p_order->>'deposit_amount')::INT, 0),
    p_order->>'status', 
    p_order->>'payment_method', 
    p_order->>'virtual_account', 
    p_order->>'line_user_id',
    (p_order->>'camp_id')::UUID
  )
  RETURNING id INTO v_order_id;

  -- 3. 新增訂單明細
  INSERT INTO nf_order_items (order_id, item_id, quantity, unit_price)
  SELECT 
    v_order_id,
    (item->>'item_id')::UUID,
    (item->>'quantity')::INT,
    (item->>'unit_price')::INT
  FROM jsonb_array_elements(p_order_items) AS item;

  -- 4. 成功，回傳訂單 ID
  RETURN jsonb_build_object('success', true, 'order_id', v_order_id);

EXCEPTION WHEN OTHERS THEN
  -- 任何一個步驟出錯（如超賣），資料庫會自動將前面的步驟全部「時光倒流 (Rollback)」，絕對不會有髒資料
  RAISE;
END;
$$;


ALTER FUNCTION "public"."create_booking_transaction"("p_order" "jsonb", "p_order_items" "jsonb", "p_inventory_updates" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."derive_spot_tags"("facilities" "text"[]) RETURNS "text"[]
    LANGUAGE "plpgsql"
    AS $$
declare
  result_tags text[] := '{}';
begin
  -- 地形類
  if facilities && array['high-altitude', 'mid-altitude'] then
    result_tags := result_tags || array['高山', '低溫'];
  end if;
  if facilities && array['seaside', 'sea-view', 'flat-ground'] then
    result_tags := result_tags || array['海邊', '平地'];
  end if;
  if facilities && array['lake-view', 'lake-mountain-view', 'lake-trail'] then
    result_tags := result_tags || array['湖邊', '潮濕'];
  end if;
  if facilities && array['forest', 'trails'] then
    result_tags := result_tags || array['森林', '自然'];
  end if;

  -- 環境提醒
  if facilities && array['cold-warning'] then
    result_tags := result_tags || array['低溫'];
  end if;
  if facilities && array['no-cooking'] then
    result_tags := result_tags || array['車中泊', '無野炊'];
  end if;
  if facilities && array['portable-toilet', 'dim-night'] then
    result_tags := result_tags || array['無廁所', '野營'];
  end if;
  if facilities && array['bugs', 'midges'] then
    result_tags := result_tags || array['防蚊'];
  end if;
  if facilities && array['quiet', 'remote'] then
    result_tags := result_tags || array['野營', '安靜'];
  end if;
  if facilities && array['foggy'] then
    result_tags := result_tags || array['濃霧', '山區'];
  end if;
  if facilities && array['shower-limited'] then
    result_tags := result_tags || array['淋浴有限'];
  end if;
  if facilities && array['windy'] then
    result_tags := result_tags || array['風大'];
  end if;

  return result_tags;
end;
$$;


ALTER FUNCTION "public"."derive_spot_tags"("facilities" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_calc_check_in_distance"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  spot_loc geography;
begin
  -- 取得泊點的 PostGIS 位置
  select location into spot_loc from spots where id = new.spot_id;

  if spot_loc is not null then
    -- 計算距離（公尺）
    new.distance_meters := round(
      st_distance(
        st_setsrid(st_makepoint(new.reported_longitude, new.reported_latitude), 4326),
        spot_loc
      )::numeric, 1
    );
    -- 是否在 300 公尺內
    new.is_verified := new.distance_meters <= 300;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."trigger_calc_check_in_distance"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."trigger_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verify_check_in_distance"("p_spot_id" "uuid", "p_reported_latitude" double precision, "p_reported_longitude" double precision, "p_max_distance_meters" double precision DEFAULT 300) RETURNS TABLE("is_within_range" boolean, "distance_meters" double precision, "spot_latitude" double precision, "spot_longitude" double precision)
    LANGUAGE "plpgsql" STABLE
    AS $$
begin
  return query
  select
    st_distance(
      st_setsrid(st_makepoint(p_reported_longitude, p_reported_latitude), 4326),
      s.location
    ) <= p_max_distance_meters as is_within_range,
    round(
      st_distance(
        st_setsrid(st_makepoint(p_reported_longitude, p_reported_latitude), 4326),
        s.location
      )::numeric, 1
    ) as distance_meters,
    s.latitude as spot_latitude,
    s.longitude as spot_longitude
  from spots s
  where s.id = p_spot_id;
end;
$$;


ALTER FUNCTION "public"."verify_check_in_distance"("p_spot_id" "uuid", "p_reported_latitude" double precision, "p_reported_longitude" double precision, "p_max_distance_meters" double precision) OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."check_in_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "spot_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "crowding" "public"."crowding_level" NOT NULL,
    "weather" "public"."weather_status" NOT NULL,
    "hot_water_status" "text",
    "summary" "text" NOT NULL,
    "reported_latitude" double precision NOT NULL,
    "reported_longitude" double precision NOT NULL,
    "distance_meters" double precision,
    "is_verified" boolean,
    "reported_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."check_in_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "spot_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "rating" smallint NOT NULL,
    "content" "text" NOT NULL,
    "visit_date" "date",
    "is_hidden" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "comments_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5)))
);


ALTER TABLE "public"."comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."nf_admins" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "email" "text" NOT NULL,
    "role" "text" DEFAULT 'superadmin'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."nf_admins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."nf_discount_codes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "discount_percent" numeric(3,2) DEFAULT 1.00 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "discount_fixed_amount" integer DEFAULT 0,
    CONSTRAINT "nf_discount_codes_discount_percent_check" CHECK ((("discount_percent" > (0)::numeric) AND ("discount_percent" <= (1)::numeric)))
);


ALTER TABLE "public"."nf_discount_codes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."nf_inventory" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "date" "date" NOT NULL,
    "item_id" "uuid" NOT NULL,
    "booked_quantity" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "override_quantity" integer
);


ALTER TABLE "public"."nf_inventory" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."nf_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "category" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "total_quantity" integer DEFAULT 0 NOT NULL,
    "price_original" integer DEFAULT 0 NOT NULL,
    "price_weekday" integer DEFAULT 0 NOT NULL,
    "price_holiday" integer DEFAULT 0 NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "image_url" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "nf_items_category_check" CHECK (("category" = ANY (ARRAY['campsite'::"text", 'equipment'::"text", 'service'::"text"])))
);


ALTER TABLE "public"."nf_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."nf_order_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "item_id" "uuid" NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "unit_price" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."nf_order_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."nf_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_no" "text" NOT NULL,
    "customer_name" "text" NOT NULL,
    "customer_phone" "text" NOT NULL,
    "license_plate" "text",
    "check_in_date" "date" NOT NULL,
    "check_out_date" "date" NOT NULL,
    "total_amount" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "notes" "text",
    "line_user_id" "text",
    "ecpay_trade_no" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "discount_code" "text",
    "discount_amount" integer DEFAULT 0 NOT NULL,
    "admin_notes" "text",
    "deposit_amount" integer DEFAULT 0,
    "payment_method" "text" DEFAULT 'ecpay'::"text",
    "virtual_account" "text",
    CONSTRAINT "nf_orders_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'paid'::"text", 'checked_in'::"text", 'cancelled'::"text", 'deposit_paid'::"text"])))
);


ALTER TABLE "public"."nf_orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."owners" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "display_name" "text" NOT NULL,
    "contact_name" "text",
    "contact_phone" "text",
    "line_user_id" "text",
    "business_status" "public"."owner_business_status" DEFAULT 'pending'::"public"."owner_business_status",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."owners" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text" NOT NULL,
    "price_hint" "text" NOT NULL,
    "image_url" "text",
    "affiliate_url" "text" NOT NULL,
    "category" "text",
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."products" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."spots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "category" "public"."spot_category" NOT NULL,
    "county" "text" NOT NULL,
    "district" "text" NOT NULL,
    "address_hint" "text",
    "latitude" double precision NOT NULL,
    "longitude" double precision NOT NULL,
    "location" "public"."geography"(Point,4326) GENERATED ALWAYS AS ("public"."st_setsrid"("public"."st_makepoint"("longitude", "latitude"), 4326)) STORED,
    "facilities" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "short_description" "text" NOT NULL,
    "description" "text" NOT NULL,
    "cover_image_url" "text",
    "is_verified" boolean DEFAULT false,
    "owner_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "google_maps_url" "text",
    "source_verified_at" timestamp with time zone,
    "source_verified_by" "text",
    "is_partner" boolean DEFAULT false,
    "official_website_url" "text",
    "booking_url" "text"
);


ALTER TABLE "public"."spots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_favorites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "spot_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_favorites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vt_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "industry" "text",
    "location" "text",
    "has_coding_experience" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."vt_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vt_purchases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "item_id" "text" NOT NULL,
    "order_no" "text",
    "amount" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "expires_at" timestamp with time zone
);


ALTER TABLE "public"."vt_purchases" OWNER TO "postgres";


ALTER TABLE ONLY "public"."check_in_reports"
    ADD CONSTRAINT "check_in_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nf_admins"
    ADD CONSTRAINT "nf_admins_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."nf_admins"
    ADD CONSTRAINT "nf_admins_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nf_discount_codes"
    ADD CONSTRAINT "nf_discount_codes_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."nf_discount_codes"
    ADD CONSTRAINT "nf_discount_codes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nf_inventory"
    ADD CONSTRAINT "nf_inventory_date_item_id_key" UNIQUE ("date", "item_id");



ALTER TABLE ONLY "public"."nf_inventory"
    ADD CONSTRAINT "nf_inventory_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nf_items"
    ADD CONSTRAINT "nf_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nf_order_items"
    ADD CONSTRAINT "nf_order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nf_orders"
    ADD CONSTRAINT "nf_orders_order_no_key" UNIQUE ("order_no");



ALTER TABLE ONLY "public"."nf_orders"
    ADD CONSTRAINT "nf_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."owners"
    ADD CONSTRAINT "owners_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."owners"
    ADD CONSTRAINT "owners_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."spots"
    ADD CONSTRAINT "spots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."spots"
    ADD CONSTRAINT "spots_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."user_favorites"
    ADD CONSTRAINT "unique_user_spot" UNIQUE ("user_id", "spot_id");



ALTER TABLE ONLY "public"."user_favorites"
    ADD CONSTRAINT "user_favorites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vt_profiles"
    ADD CONSTRAINT "vt_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vt_purchases"
    ADD CONSTRAINT "vt_purchases_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_checkins_spot" ON "public"."check_in_reports" USING "btree" ("spot_id", "reported_at" DESC);



CREATE INDEX "idx_comments_spot" ON "public"."comments" USING "btree" ("spot_id", "created_at" DESC);



CREATE UNIQUE INDEX "idx_products_name" ON "public"."products" USING "btree" ("name");



CREATE INDEX "idx_products_tags" ON "public"."products" USING "gin" ("tags");



CREATE INDEX "idx_spots_location" ON "public"."spots" USING "gist" ("location");



CREATE INDEX "idx_spots_slug" ON "public"."spots" USING "btree" ("slug");



CREATE INDEX "idx_spots_tags" ON "public"."spots" USING "gin" ("tags");



CREATE OR REPLACE TRIGGER "set_comments_updated_at" BEFORE UPDATE ON "public"."comments" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_updated_at"();



CREATE OR REPLACE TRIGGER "set_owners_updated_at" BEFORE UPDATE ON "public"."owners" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_updated_at"();



CREATE OR REPLACE TRIGGER "set_spots_updated_at" BEFORE UPDATE ON "public"."spots" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_calc_check_in_distance" BEFORE INSERT ON "public"."check_in_reports" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_calc_check_in_distance"();



ALTER TABLE ONLY "public"."check_in_reports"
    ADD CONSTRAINT "check_in_reports_spot_id_fkey" FOREIGN KEY ("spot_id") REFERENCES "public"."spots"("id");



ALTER TABLE ONLY "public"."check_in_reports"
    ADD CONSTRAINT "check_in_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_spot_id_fkey" FOREIGN KEY ("spot_id") REFERENCES "public"."spots"("id");



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."nf_inventory"
    ADD CONSTRAINT "nf_inventory_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."nf_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nf_order_items"
    ADD CONSTRAINT "nf_order_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."nf_items"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."nf_order_items"
    ADD CONSTRAINT "nf_order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."nf_orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."owners"
    ADD CONSTRAINT "owners_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."spots"
    ADD CONSTRAINT "spots_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id");



ALTER TABLE ONLY "public"."user_favorites"
    ADD CONSTRAINT "user_favorites_spot_id_fkey" FOREIGN KEY ("spot_id") REFERENCES "public"."spots"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_favorites"
    ADD CONSTRAINT "user_favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vt_profiles"
    ADD CONSTRAINT "vt_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."vt_purchases"
    ADD CONSTRAINT "vt_purchases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



CREATE POLICY "Allow admins to read all and customers to read own items" ON "public"."nf_order_items" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."nf_admins" "a"
  WHERE ("a"."email" = ("auth"."jwt"() ->> 'email'::"text")))) OR (EXISTS ( SELECT 1
   FROM "public"."nf_orders" "o"
  WHERE (("o"."id" = "nf_order_items"."order_id") AND (("o"."line_user_id" = (("auth"."jwt"() -> 'user_metadata'::"text") ->> 'line_id'::"text")) OR ("o"."notes" ~~* (('%[Email: '::"text" || ("auth"."jwt"() ->> 'email'::"text")) || ']%'::"text"))))))));



CREATE POLICY "Allow admins to read all and customers to read own orders" ON "public"."nf_orders" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."nf_admins" "a"
  WHERE ("a"."email" = "lower"(("auth"."jwt"() ->> 'email'::"text"))))) OR ("line_user_id" = (("auth"."jwt"() -> 'user_metadata'::"text") ->> 'line_id'::"text")) OR ("notes" ~~* (('%[Email: '::"text" || ("auth"."jwt"() ->> 'email'::"text")) || ']%'::"text"))));



CREATE POLICY "Allow customer to update own order" ON "public"."nf_orders" FOR UPDATE USING ((("line_user_id" = (("auth"."jwt"() -> 'user_metadata'::"text") ->> 'line_id'::"text")) OR ("notes" ~~* (('%[Email: '::"text" || ("auth"."jwt"() ->> 'email'::"text")) || ']%'::"text"))));



CREATE POLICY "Allow delete for superadmin and editor" ON "public"."nf_order_items" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."nf_admins" "a"
  WHERE (("a"."email" = ("auth"."jwt"() ->> 'email'::"text")) AND ("a"."role" = ANY (ARRAY['superadmin'::"text", 'editor'::"text"]))))));



CREATE POLICY "Allow delete for superadmin and editor" ON "public"."nf_orders" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."nf_admins" "a"
  WHERE (("a"."email" = ("auth"."jwt"() ->> 'email'::"text")) AND ("a"."role" = ANY (ARRAY['superadmin'::"text", 'editor'::"text"]))))));



CREATE POLICY "Allow delete for superadmins" ON "public"."nf_admins" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."nf_admins" "a"
  WHERE (("a"."email" = ("auth"."jwt"() ->> 'email'::"text")) AND ("a"."role" = 'superadmin'::"text")))));



CREATE POLICY "Allow full access for superadmin and editor" ON "public"."nf_discount_codes" USING ((EXISTS ( SELECT 1
   FROM "public"."nf_admins" "a"
  WHERE (("a"."email" = ("auth"."jwt"() ->> 'email'::"text")) AND ("a"."role" = ANY (ARRAY['superadmin'::"text", 'editor'::"text"]))))));



CREATE POLICY "Allow full access for superadmin and editor" ON "public"."nf_inventory" USING ((EXISTS ( SELECT 1
   FROM "public"."nf_admins" "a"
  WHERE (("a"."email" = ("auth"."jwt"() ->> 'email'::"text")) AND ("a"."role" = ANY (ARRAY['superadmin'::"text", 'editor'::"text"]))))));



CREATE POLICY "Allow full access for superadmin and editor" ON "public"."nf_items" USING ((EXISTS ( SELECT 1
   FROM "public"."nf_admins" "a"
  WHERE (("a"."email" = ("auth"."jwt"() ->> 'email'::"text")) AND ("a"."role" = ANY (ARRAY['superadmin'::"text", 'editor'::"text"]))))));



CREATE POLICY "Allow insert for authenticated users" ON "public"."nf_order_items" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow insert for authenticated users" ON "public"."nf_orders" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow insert for superadmins" ON "public"."nf_admins" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."nf_admins" "a"
  WHERE (("a"."email" = ("auth"."jwt"() ->> 'email'::"text")) AND ("a"."role" = 'superadmin'::"text")))));



CREATE POLICY "Allow read access for all" ON "public"."nf_discount_codes" FOR SELECT USING (true);



CREATE POLICY "Allow read access for all" ON "public"."nf_inventory" FOR SELECT USING (true);



CREATE POLICY "Allow read access for all" ON "public"."nf_items" FOR SELECT USING (true);



CREATE POLICY "Allow read access for all admins" ON "public"."nf_admins" FOR SELECT USING (true);



CREATE POLICY "Allow update for superadmin and editor" ON "public"."nf_order_items" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."nf_admins" "a"
  WHERE (("a"."email" = ("auth"."jwt"() ->> 'email'::"text")) AND ("a"."role" = ANY (ARRAY['superadmin'::"text", 'editor'::"text"]))))));



CREATE POLICY "Allow update for superadmin and editor" ON "public"."nf_orders" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."nf_admins" "a"
  WHERE (("a"."email" = "lower"(("auth"."jwt"() ->> 'email'::"text"))) AND ("a"."role" = ANY (ARRAY['superadmin'::"text", 'editor'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."nf_admins" "a"
  WHERE (("a"."email" = "lower"(("auth"."jwt"() ->> 'email'::"text"))) AND ("a"."role" = ANY (ARRAY['superadmin'::"text", 'editor'::"text"]))))));



CREATE POLICY "Allow update for superadmins" ON "public"."nf_admins" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."nf_admins" "a"
  WHERE (("a"."email" = ("auth"."jwt"() ->> 'email'::"text")) AND ("a"."role" = 'superadmin'::"text")))));



CREATE POLICY "Enable insert for all" ON "public"."vt_purchases" FOR INSERT WITH CHECK (true);



CREATE POLICY "Enable read access for own purchases" ON "public"."vt_purchases" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."check_in_reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."comments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."nf_admins" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."nf_discount_codes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."nf_inventory" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."nf_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."nf_order_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."nf_orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."owners" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "products_admin_all" ON "public"."products" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "products_public_read" ON "public"."products" FOR SELECT USING (("is_active" = true));



ALTER TABLE "public"."spots" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "spots_public_read" ON "public"."spots" FOR SELECT USING (true);



ALTER TABLE "public"."user_favorites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vt_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vt_purchases" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "使用者只能新增自己的 Profile" ON "public"."vt_profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "使用者只能更新自己的 Profile" ON "public"."vt_profiles" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "使用者只能看到自己的收藏" ON "public"."user_favorites" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "使用者可以刪除自己的收藏" ON "public"."user_favorites" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "使用者可以新增自己的收藏" ON "public"."user_favorites" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "所有人都可以讀取公開 Profile" ON "public"."vt_profiles" FOR SELECT USING (true);



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON TABLE "public"."check_in_reports" TO "anon";
GRANT ALL ON TABLE "public"."check_in_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."check_in_reports" TO "service_role";



GRANT ALL ON TABLE "public"."comments" TO "anon";
GRANT ALL ON TABLE "public"."comments" TO "authenticated";
GRANT ALL ON TABLE "public"."comments" TO "service_role";



GRANT ALL ON TABLE "public"."nf_admins" TO "anon";
GRANT ALL ON TABLE "public"."nf_admins" TO "authenticated";
GRANT ALL ON TABLE "public"."nf_admins" TO "service_role";



GRANT ALL ON TABLE "public"."nf_discount_codes" TO "anon";
GRANT ALL ON TABLE "public"."nf_discount_codes" TO "authenticated";
GRANT ALL ON TABLE "public"."nf_discount_codes" TO "service_role";



GRANT ALL ON TABLE "public"."nf_inventory" TO "anon";
GRANT ALL ON TABLE "public"."nf_inventory" TO "authenticated";
GRANT ALL ON TABLE "public"."nf_inventory" TO "service_role";



GRANT ALL ON TABLE "public"."nf_items" TO "anon";
GRANT ALL ON TABLE "public"."nf_items" TO "authenticated";
GRANT ALL ON TABLE "public"."nf_items" TO "service_role";



GRANT ALL ON TABLE "public"."nf_order_items" TO "anon";
GRANT ALL ON TABLE "public"."nf_order_items" TO "authenticated";
GRANT ALL ON TABLE "public"."nf_order_items" TO "service_role";



GRANT ALL ON TABLE "public"."nf_orders" TO "anon";
GRANT ALL ON TABLE "public"."nf_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."nf_orders" TO "service_role";



GRANT ALL ON TABLE "public"."owners" TO "anon";
GRANT ALL ON TABLE "public"."owners" TO "authenticated";
GRANT ALL ON TABLE "public"."owners" TO "service_role";



GRANT ALL ON TABLE "public"."products" TO "anon";
GRANT ALL ON TABLE "public"."products" TO "authenticated";
GRANT ALL ON TABLE "public"."products" TO "service_role";



GRANT ALL ON TABLE "public"."spots" TO "anon";
GRANT ALL ON TABLE "public"."spots" TO "authenticated";
GRANT ALL ON TABLE "public"."spots" TO "service_role";



GRANT ALL ON TABLE "public"."user_favorites" TO "anon";
GRANT ALL ON TABLE "public"."user_favorites" TO "authenticated";
GRANT ALL ON TABLE "public"."user_favorites" TO "service_role";



GRANT ALL ON TABLE "public"."vt_profiles" TO "anon";
GRANT ALL ON TABLE "public"."vt_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."vt_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."vt_purchases" TO "anon";
GRANT ALL ON TABLE "public"."vt_purchases" TO "authenticated";
GRANT ALL ON TABLE "public"."vt_purchases" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "service_role";








-- ============================================================
-- 金流明細表：記錄每一筆實際收款
-- payment_type: 'bank_transfer' = 匯款, 'onsite' = 現場收款
-- collected_by: 管理員 Email（誰經手的）
-- ============================================================
CREATE TABLE IF NOT EXISTS "public"."nf_payment_logs" (
    "id"              "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id"        "uuid" NOT NULL REFERENCES "public"."nf_orders"("id") ON DELETE CASCADE,
    "amount"          integer NOT NULL,
    "payment_type"    "text" NOT NULL,
    "collected_by"    "text" NOT NULL,
    "collected_at"    timestamp with time zone DEFAULT "now"() NOT NULL,
    "notes"           "text"
);


ALTER TABLE "public"."nf_payment_logs" OWNER TO "postgres";

-- ============================================================
-- 金流明細表：記錄每一筆實際收款
-- payment_type: 'bank_transfer' = 匯款, 'onsite' = 現場收款
-- collected_by: 管理員 Email（誰經手的）
-- ============================================================
CREATE TABLE IF NOT EXISTS "public"."nf_payment_logs" (
    "id"              "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id"        "uuid" NOT NULL REFERENCES "public"."nf_orders"("id") ON DELETE CASCADE,
    "amount"          integer NOT NULL,
    "payment_type"    "text" NOT NULL,
    "collected_by"    "text" NOT NULL,
    "collected_at"    timestamp with time zone DEFAULT "now"() NOT NULL,
    "notes"           "text"
);


ALTER TABLE "public"."nf_payment_logs" OWNER TO "postgres";

-- ============================================================
-- nf_payment_logs RLS Policies
-- ============================================================
ALTER TABLE "public"."nf_payment_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "Allow admins to read payment logs"
  ON "public"."nf_payment_logs"
  FOR SELECT
  USING ((EXISTS (
    SELECT 1 FROM "public"."nf_admins" "a"
    WHERE ("a"."email" = ("auth"."jwt"() ->> 'email'::"text"))
  )));


CREATE POLICY "Allow authenticated users to insert payment logs"
  ON "public"."nf_payment_logs"
  FOR INSERT
  WITH CHECK (("auth"."role"() = 'authenticated'::"text"));


CREATE POLICY "Allow superadmin and editor to update payment logs"
  ON "public"."nf_payment_logs"
  FOR UPDATE
  USING ((EXISTS (
    SELECT 1 FROM "public"."nf_admins" "a"
    WHERE (("a"."email" = ("auth"."jwt"() ->> 'email'::"text"))
      AND ("a"."role" = ANY (ARRAY['superadmin'::"text", 'editor'::"text"])))
  )));


CREATE POLICY "Allow superadmin and editor to delete payment logs"
  ON "public"."nf_payment_logs"
  FOR DELETE
  USING ((EXISTS (
    SELECT 1 FROM "public"."nf_admins" "a"
    WHERE (("a"."email" = ("auth"."jwt"() ->> 'email'::"text"))
      AND ("a"."role" = ANY (ARRAY['superadmin'::"text", 'editor'::"text"])))
  )));

-- ============================================================
-- Trigger: 自動同步 payment_logs 到 orders.deposit_amount
-- ============================================================
CREATE OR REPLACE FUNCTION sync_order_deposit()
RETURNS TRIGGER AS $$
DECLARE
  v_total INT;
  v_order_id UUID;
BEGIN
  v_order_id := COALESCE(NEW.order_id, OLD.order_id);

  SELECT COALESCE(SUM(amount), 0) INTO v_total
  FROM nf_payment_logs
  WHERE order_id = v_order_id;

  UPDATE nf_orders
  SET deposit_amount = v_total,
      status = CASE
        WHEN v_total >= total_amount THEN 'paid'
        WHEN v_total > 0 THEN 'deposit_paid'
        ELSE 'pending'
      END
  WHERE id = v_order_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE TRIGGER trigger_sync_order_deposit
  AFTER INSERT OR UPDATE OR DELETE ON nf_payment_logs
  FOR EACH ROW EXECUTE FUNCTION sync_order_deposit();

-- ============================================================
-- nf_* Indexes：提升查詢效能
-- ============================================================

-- nf_orders
CREATE INDEX IF NOT EXISTS idx_nf_orders_status_date
  ON nf_orders (status, check_in_date);

CREATE INDEX IF NOT EXISTS idx_nf_orders_line_user
  ON nf_orders (line_user_id);

CREATE INDEX IF NOT EXISTS idx_nf_orders_order_no
  ON nf_orders (order_no);

CREATE INDEX IF NOT EXISTS idx_nf_orders_created_at
  ON nf_orders (created_at DESC);

-- nf_items
CREATE INDEX IF NOT EXISTS idx_nf_items_category
  ON nf_items (category);

-- nf_inventory
CREATE INDEX IF NOT EXISTS idx_nf_inventory_item_date
  ON nf_inventory (item_id, date);

-- nf_order_items
CREATE INDEX IF NOT EXISTS idx_nf_order_items_order
  ON nf_order_items (order_id);

CREATE INDEX IF NOT EXISTS idx_nf_order_items_item
  ON nf_order_items (item_id);

-- nf_payment_logs
CREATE INDEX IF NOT EXISTS idx_nf_payment_logs_order
  ON nf_payment_logs (order_id);

CREATE INDEX IF NOT EXISTS idx_nf_payment_logs_collected
  ON nf_payment_logs (collected_by);

-- ============================================================
-- 營區基本資料表
-- ============================================================
CREATE TABLE IF NOT EXISTS "public"."nf_campgrounds" (
    "id"              "uuid" DEFAULT "gen_random_uuid"() NOT NULL PRIMARY KEY,
    "name"            "text" NOT NULL,
    "slug"            "text" NOT NULL UNIQUE,
    "description"     "text",
    "created_at"      timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."nf_campgrounds" OWNER TO "postgres";


-- 插入預設營區（不遠露營度假山莊）
INSERT INTO "public"."nf_campgrounds" ("name", "slug", "description")
VALUES ('不遠露營度假山莊', 'not-far', '南投國姓鄉的露營度假山莊')
ON CONFLICT ("slug") DO NOTHING;


-- ============================================================
-- 為既有表新增 camp_id
-- ============================================================

-- nf_items
ALTER TABLE "public"."nf_items"
  ADD COLUMN IF NOT EXISTS "camp_id" "uuid" REFERENCES "public"."nf_campgrounds"("id");

-- 將既有資料的 camp_id 填入預設營區
UPDATE "public"."nf_items"
SET "camp_id" = (SELECT "id" FROM "public"."nf_campgrounds" WHERE "slug" = 'not-far')
WHERE "camp_id" IS NULL;

-- 之後新資料強制必填
ALTER TABLE "public"."nf_items"
  ALTER COLUMN "camp_id" SET NOT NULL;


-- nf_orders
ALTER TABLE "public"."nf_orders"
  ADD COLUMN IF NOT EXISTS "camp_id" "uuid" REFERENCES "public"."nf_campgrounds"("id");

UPDATE "public"."nf_orders"
SET "camp_id" = (SELECT "id" FROM "public"."nf_campgrounds" WHERE "slug" = 'not-far')
WHERE "camp_id" IS NULL;

ALTER TABLE "public"."nf_orders"
  ALTER COLUMN "camp_id" SET NOT NULL;


-- nf_admins（可選，管理員可跨營區）
ALTER TABLE "public"."nf_admins"
  ADD COLUMN IF NOT EXISTS "camp_id" "uuid" REFERENCES "public"."nf_campgrounds"("id");


-- nf_discount_codes（可選，折扣碼可跨營區）
ALTER TABLE "public"."nf_discount_codes"
  ADD COLUMN IF NOT EXISTS "camp_id" "uuid" REFERENCES "public"."nf_campgrounds"("id");
