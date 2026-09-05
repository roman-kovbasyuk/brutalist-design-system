LOCK TABLE campaigns, campaign_versions, assets, deliveries, review_events, audit_events
  IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM audit_events audit
    LEFT JOIN deliveries delivery ON delivery.version_id = audit.version_id
    WHERE audit.action IN ('campaign.delivered', 'campaign.deliver')
      AND (
        delivery.id IS NULL
        OR audit.action <> 'campaign.delivered'
        OR audit.entity_type <> 'campaign'
        OR audit.entity_id <> delivery.campaign_id
      )
  ) OR EXISTS (
    SELECT 1
    FROM audit_events audit
    WHERE audit.action IN ('campaign.delivered', 'campaign.deliver')
    GROUP BY audit.version_id
    HAVING audit.version_id IS NULL OR count(*) <> 1
  ) OR EXISTS (
    SELECT 1 FROM deliveries delivery
    WHERE NOT delivery_state_is_valid(delivery.version_id, false)
  ) THEN
    RAISE EXCEPTION 'historical delivery audit facts are invalid or duplicated' USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE UNIQUE INDEX audit_events_one_delivery_action_per_version_idx
  ON audit_events (version_id)
  WHERE version_id IS NOT NULL
    AND action IN ('campaign.delivered', 'campaign.deliver');

CREATE FUNCTION enforce_delivery_audit_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.action IN ('campaign.delivered', 'campaign.deliver')
     AND (
       NEW.action <> 'campaign.delivered'
       OR NEW.version_id IS NULL
       OR NOT delivery_state_is_valid(NEW.version_id, true)
     ) THEN
    RAISE EXCEPTION 'delivery audit is not the exact current-transaction delivery fact'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER delivery_audits_exact_chain
  AFTER INSERT ON audit_events DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION enforce_delivery_audit_insert();
