-- Ravel seed. Exact rows from the brief.
BEGIN;

INSERT INTO site (reference, name, confidence, certification_state, nameplate_kg, contracted_kg, capacity_basis, last_revised) VALUES
 ('SITE-PILOT','Pilot','commissioned','certified',40000,24000,'8000 hours per year, 0.90 availability, 0.80 yield','2026-06-30'),
 ('SITE-DEMO','Demonstration','commissioned','certified',400000,320000,'8000 hours per year, 0.90 availability, 0.80 yield','2026-06-30'),
 ('SITE-COMM','Commercial','planned','not_certified',25000000,26000000,'8000 hours per year, 0.90 availability, 0.80 yield','2026-06-30');

INSERT INTO collector (reference, name, country, registration, registration_expiry, site_types, streams, scheme_status) VALUES
 ('COL-ALDER','Alder Reclaim','PT','WCR-PT-4471','2027-03-31','{collection_site,transfer_station}','{post_consumer_textile,fishing_net}','registered'),
 ('COL-BRINE','Brine Textile Recovery','NL','WCR-NL-2208','2027-01-31','{collection_site}','{post_consumer_textile}','registered'),
 ('COL-CINDER','Cinder Industrial Offcuts','FR','WCR-FR-6613','2026-12-31','{industrial_site}','{pre_consumer_offcut}','registered');

INSERT INTO approval_period (collector, state, valid_from, valid_to, condition, condition_closes_on, recorded_by) VALUES
 ('COL-ALDER','approved','2026-01-01','2026-12-31',NULL,NULL,'quality@example.com'),
 ('COL-BRINE','approved','2026-01-01','2026-06-30',NULL,NULL,'quality@example.com'),
 ('COL-CINDER','conditional','2026-01-01','2026-12-31','Sampling plan for coated streams to be agreed','2026-10-31','quality@example.com');

INSERT INTO party_version (reference, name, effective_from) VALUES
 ('COL-BRINE','Brine Textile Recovery','2026-01-01'),
 ('COL-BRINE','Brine Circular Materials','2026-08-01'),
 ('COL-ALDER','Alder Reclaim','2026-01-01'),
 ('COL-CINDER','Cinder Industrial Offcuts','2026-01-01'),
 ('CUS-HELIOS','Helios Performance Fabrics','2026-01-01'),
 ('CUS-VANTA','Vanta Technical Textiles','2026-01-01');

INSERT INTO weighing_device (reference, site, calibrated_on) VALUES
 ('WB-DEMO-01','SITE-DEMO','2026-05-01'),
 ('WB-DEMO-02','SITE-DEMO','2025-02-01');

INSERT INTO recipe_version (reference, stage, set_points, released_by, released_on) VALUES
 ('RCP-DISS-2','dissolution','{"temperature":{"set":165,"min":160,"max":170,"unit":"C"},"pressure":{"set":3,"min":2,"max":4,"unit":"bar"},"residence_minutes":{"set":90,"min":80,"max":100},"reagents":[{"name":"ethanol","ratio_bp":1500}]}','quality@example.com','2026-01-05'),
 ('RCP-DEPO-4','depolymerisation','{"temperature":{"set":240,"min":230,"max":250,"unit":"C"},"pressure":{"set":5,"min":4,"max":6,"unit":"bar"},"residence_minutes":{"set":180,"min":160,"max":200},"reagents":[{"name":"caprolactam_recover","ratio_bp":0}]}','quality@example.com','2026-01-05'),
 ('RCP-PURI-1','purification','{"temperature":{"set":150,"min":145,"max":158,"unit":"C"},"pressure":{"set":2,"min":1,"max":3,"unit":"bar"},"residence_minutes":{"set":120,"min":110,"max":130},"reagents":[{"name":"activated_carbon","ratio_bp":300}]}','quality@example.com','2026-01-05'),
 ('RCP-REPO-3','repolymerisation','{"temperature":{"set":260,"min":250,"max":270,"unit":"C"},"pressure":{"set":4,"min":3,"max":5,"unit":"bar"},"residence_minutes":{"set":300,"min":280,"max":320},"reagents":[{"name":"catalyst","ratio_bp":50}]}','quality@example.com','2026-01-05');

-- batches
INSERT INTO batch (reference, collector, collector_name, site, grade, category, gross_g, tare_g, net_g, moisture_bp, moisture_method, device, received_on, received_at, composition, contamination, custody, accepted_g, rejected_g, booked_by) VALUES
 ('BATCH-1001','COL-ALDER','Alder Reclaim','SITE-DEMO','N6','post_consumer',512000,12000,500000,1000,'oven','WB-DEMO-01','2026-02-10','2026-02-10T08:40:00Z',
  '[{"polymer":"PA6","fraction_bp":9200,"basis":"sampled","measured_fraction_bp":9200}]',
  '{"non_nylon_bp":300,"elastane_bp":400,"coatings":"none","colour_load":"medium","foreign_matter":"low"}',
  '[{"kind":"collection_site","date":"2026-02-08","party":"Alder Reclaim"},{"kind":"collector","date":"2026-02-08","party":"Alder Reclaim"},{"kind":"transport","date":"2026-02-09","party":"Haulier Mendes"},{"kind":"arrival","date":"2026-02-10","party":"SITE-DEMO"},{"kind":"weighing","date":"2026-02-10","party":"SITE-DEMO"},{"kind":"acceptance","date":"2026-02-10","party":"SITE-DEMO"}]',
  500000,0,'plant@example.com'),
 ('BATCH-1002','COL-ALDER','Alder Reclaim','SITE-DEMO','N6','pre_consumer',308000,8000,300000,0,'oven','WB-DEMO-01','2026-02-12','2026-02-12T07:15:00Z',
  '[{"polymer":"PA6","fraction_bp":9900,"basis":"declared"}]',
  '{"non_nylon_bp":50,"elastane_bp":0,"coatings":"none","colour_load":"low","foreign_matter":"none"}',
  '[{"kind":"collection_site","date":"2026-02-11","party":"Alder Reclaim"},{"kind":"collector","date":"2026-02-11","party":"Alder Reclaim"},{"kind":"transport","date":"2026-02-11","party":"Haulier Mendes"},{"kind":"arrival","date":"2026-02-12","party":"SITE-DEMO"},{"kind":"weighing","date":"2026-02-12","party":"SITE-DEMO"},{"kind":"acceptance","date":"2026-02-12","party":"SITE-DEMO"}]',
  300000,0,'plant@example.com'),
 ('BATCH-1003','COL-BRINE','Brine Textile Recovery','SITE-DEMO','N6','post_consumer',204000,4000,200000,500,'oven','WB-DEMO-01','2026-07-05','2026-07-05T09:05:00Z',
  '[{"polymer":"PA6","fraction_bp":9000,"basis":"declared"}]',
  '{"non_nylon_bp":400,"elastane_bp":600,"coatings":"some","colour_load":"high","foreign_matter":"medium"}',
  '[{"kind":"collection_site","date":"2026-07-03","party":"Brine Textile Recovery"},{"kind":"collector","date":"2026-07-03","party":"Brine Textile Recovery"},{"kind":"transport","date":"2026-07-04","party":"Haulier de Vries"},{"kind":"arrival","date":"2026-07-05","party":"SITE-DEMO"},{"kind":"weighing","date":"2026-07-05","party":"SITE-DEMO"},{"kind":"acceptance","date":"2026-07-05","party":"SITE-DEMO"}]',
  200000,0,'plant@example.com'),
 ('BATCH-1004','COL-CINDER','Cinder Industrial Offcuts','SITE-DEMO','N6','pre_consumer',124000,4000,120000,0,'oven','WB-DEMO-02','2026-02-20','2026-02-20T06:14:00Z',
  '[{"polymer":"PA6","fraction_bp":9900,"basis":"declared","measured_fraction_bp":9100}]',
  '{"non_nylon_bp":100,"elastane_bp":0,"coatings":"none","colour_load":"low","foreign_matter":"none"}',
  '[{"kind":"collection_site","date":"2026-02-19","party":"Cinder Industrial Offcuts"},{"kind":"collector","date":"2026-02-19","party":"Cinder Industrial Offcuts"},{"kind":"transport","date":"2026-02-19","party":"Haulier Petit"},{"kind":"arrival","date":"2026-02-20","party":"SITE-DEMO"},{"kind":"weighing","date":"2026-02-20","party":"SITE-DEMO"},{"kind":"acceptance","date":"2026-02-20","party":"SITE-DEMO"}]',
  120000,0,'plant@example.com'),
 ('BATCH-1005','COL-ALDER','Alder Reclaim','SITE-DEMO','N6','post_consumer',104000,4000,100000,0,'oven','WB-DEMO-01','2026-03-02','2026-03-02T10:20:00Z',
  '[{"polymer":"PA6","fraction_bp":9300,"basis":"declared"}]',
  '{"non_nylon_bp":300,"elastane_bp":500,"coatings":"none","colour_load":"medium","foreign_matter":"low"}',
  '[{"kind":"collection_site","date":"2026-03-01","party":"Alder Reclaim"},{"kind":"collector","date":"2026-03-01","party":"Alder Reclaim"},{"kind":"arrival","date":"2026-03-02","party":"SITE-DEMO"},{"kind":"weighing","date":"2026-03-02","party":"SITE-DEMO"},{"kind":"acceptance","date":"2026-03-02","party":"SITE-DEMO"}]',
  100000,0,'plant@example.com');

INSERT INTO finding (reference, collector, batch, reason, departure_bp, raised_on, due_on, state) VALUES
 ('FND-0001','COL-CINDER','BATCH-1004','Measured composition departed from the declaration by more than 500 basis points',800,'2026-03-01','2026-04-01','open');

-- runs
INSERT INTO run (reference, run_type, site, equipment, recipe_version, operator, started_at, recorded_at, closed_at, state, losses_g, mass_in_g, mass_out_g, achieved) VALUES
 ('RUN-D-0001','dissolution','SITE-DEMO','DISS-A','RCP-DISS-2','plant@example.com','2026-03-01T06:00:00Z','2026-03-01T06:00:00Z','2026-03-01T14:00:00Z','closed',120000,600000,480000,'{"temperature":165,"pressure":3,"residence_minutes":92}'),
 ('RUN-D-0002','dissolution','SITE-DEMO','DISS-B','RCP-DISS-2','plant@example.com','2026-03-02T06:00:00Z','2026-03-02T06:00:00Z','2026-03-02T15:00:00Z','closed',60000,310000,250000,'{"temperature":166,"pressure":3,"residence_minutes":95}'),
 ('RUN-D-0003','dissolution','SITE-DEMO','DISS-A','RCP-DISS-2','plant@example.com','2026-03-04T06:00:00Z','2026-03-04T06:00:00Z','2026-03-04T12:00:00Z','closed',30000,150000,120000,'{"temperature":163,"pressure":3,"residence_minutes":90}'),
 ('RUN-Y-0001','depolymerisation','SITE-DEMO','DEPO-1','RCP-DEPO-4','plant@example.com','2026-03-06T08:00:00Z','2026-03-06T08:00:00Z','2026-03-07T02:00:00Z','closed',50000,850000,800000,'{"temperature":245,"pressure":5,"residence_minutes":185}'),
 ('RUN-U-0001','purification','SITE-DEMO','PUR-2','RCP-PURI-1','plant@example.com','2026-03-08T04:00:00Z','2026-03-08T04:00:00Z','2026-03-08T20:00:00Z','closed',40000,800000,760000,'{"temperature":152,"pressure":2,"residence_minutes":125}'),
 ('RUN-R-0001','repolymerisation','SITE-DEMO','REPO-1','RCP-REPO-3','plant@example.com','2026-03-10T02:00:00Z','2026-03-10T02:00:00Z','2026-03-11T10:00:00Z','closed',20000,720000,700000,'{"temperature":258,"pressure":4,"residence_minutes":300}');

INSERT INTO consumption (reference, run, input, input_kind, mass_g, consumed_at, effective_on, recorded_by) VALUES
 ('CON-D1-1','RUN-D-0001','BATCH-1001','batch',300000,'2026-03-01T06:30:00Z','2026-03-01','plant@example.com'),
 ('CON-D1-2','RUN-D-0001','BATCH-1002','batch',300000,'2026-03-01T06:45:00Z','2026-03-01','plant@example.com'),
 ('CON-D2-1','RUN-D-0002','BATCH-1003','batch',190000,'2026-03-02T06:30:00Z','2026-03-02','plant@example.com'),
 ('CON-D2-2','RUN-D-0002','BATCH-1004','batch',120000,'2026-03-02T06:50:00Z','2026-03-02','plant@example.com'),
 ('CON-D3-1','RUN-D-0003','BATCH-1001','batch',150000,'2026-03-04T06:30:00Z','2026-03-04','plant@example.com'),
 ('CON-Y1-1','RUN-Y-0001','OUT-D-0001','output',480000,'2026-03-06T08:30:00Z','2026-03-06','plant@example.com'),
 ('CON-Y1-2','RUN-Y-0001','OUT-D-0002','output',250000,'2026-03-06T09:00:00Z','2026-03-06','plant@example.com'),
 ('CON-Y1-3','RUN-Y-0001','OUT-D-0003','output',120000,'2026-03-06T09:20:00Z','2026-03-06','plant@example.com'),
 ('CON-U1-1','RUN-U-0001','OUT-Y-0001','output',800000,'2026-03-08T04:30:00Z','2026-03-08','plant@example.com'),
 ('CON-R1-1','RUN-R-0001','OUT-U-0001','output',720000,'2026-03-10T02:30:00Z','2026-03-10','plant@example.com');

INSERT INTO output (reference, run, kind, mass_g, disposition, lot, produced_at) VALUES
 ('OUT-D-0001','RUN-D-0001','intermediate',480000,NULL,NULL,'2026-03-01T14:00:00Z'),
 ('OUT-D-0002','RUN-D-0002','intermediate',250000,NULL,NULL,'2026-03-02T15:00:00Z'),
 ('OUT-D-0003','RUN-D-0003','intermediate',120000,NULL,NULL,'2026-03-04T12:00:00Z'),
 ('OUT-Y-0001','RUN-Y-0001','intermediate',800000,NULL,NULL,'2026-03-07T02:00:00Z'),
 ('OUT-U-0001','RUN-U-0001','intermediate',720000,NULL,NULL,'2026-03-08T20:00:00Z'),
 ('OUT-U-0002','RUN-U-0001','byproduct',40000,'sold',NULL,'2026-03-08T20:00:00Z');

INSERT INTO lot (reference, site, grade, mass_g, disposition, disposition_by, disposition_on, claim_type, produced_at, produced_by) VALUES
 ('LOT-N6-0001','SITE-DEMO','N6',400000,'released','quality@example.com','2026-03-20','mass_balance','2026-03-11T10:00:00Z','plant@example.com'),
 ('LOT-N6-0002','SITE-DEMO','N6',300000,'quarantined','quality@example.com','2026-03-19','mass_balance','2026-03-11T10:00:00Z','plant@example.com'),
 ('LOT-N6-0003','SITE-PILOT','N6',200000,'released','quality@example.com','2026-03-02','mass_balance','2026-02-28T10:00:00Z','plant@example.com');
INSERT INTO output (reference, run, kind, mass_g, lot, produced_at) VALUES
 ('OUT-R1-1','RUN-R-0001','lot',400000,'LOT-N6-0001','2026-03-11T10:00:00Z'),
 ('OUT-R1-2','RUN-R-0001','lot',300000,'LOT-N6-0002','2026-03-11T10:00:00Z');

INSERT INTO deviation (reference, state, raised_by, raised_on, description, outcome, closed_on) VALUES
 ('DEV-0001','open','quality@example.com','2026-03-12','Purification holdup above recipe window on RUN-U-0001',NULL,NULL),
 ('DEV-0002','closed','quality@example.com','2026-03-03','Dissolution pressure excursion on RUN-D-0002','cause_not_established','2026-03-15');
INSERT INTO deviation_subject (deviation, subject_kind, subject) VALUES
 ('DEV-0001','run','RUN-U-0001'),('DEV-0001','lot','LOT-N6-0002'),
 ('DEV-0002','run','RUN-D-0002');

INSERT INTO override (reference, separation, reason, lot, authorised_by, authorised_on, reviewed, reviewed_by, reviewed_on) VALUES
 ('OVR-0001','analyst_not_dispositioner','Night shift analyst dispositioned the lot because no second qualified person was on site','LOT-N6-0001','quality@example.com','2026-03-18',false,NULL,NULL);

INSERT INTO test_result (reference, subject_kind, subject, property, method, instrument, analyst, value, unit, uncertainty_bp, taken_on) VALUES
 ('TST-0001','lot','LOT-N6-0001','relative_viscosity','ISO 307','VISC-2','analyst@example.com',2.44,'ratio',400,'2026-03-12'),
 ('TST-0002','lot','LOT-N6-0001','moisture','ISO 15512','KF-1','analyst@example.com',0.08,'percent',200,'2026-03-12');

INSERT INTO balance_period (id, site, grade, period_from, period_to, state, carry_over_limit_bp, allocation_basis, closed_on, closed_by, cut_off) VALUES
 ('BP-DEMO-N6-2025H2','SITE-DEMO','N6','2025-07-01','2025-12-31','closed',2000,'mass','2026-01-15','claims@example.com','2026-01-10'),
 ('BP-DEMO-N6-2026H1','SITE-DEMO','N6','2026-01-01','2026-06-30','open',2000,'mass',NULL,NULL,NULL),
 ('BP-PILOT-N6-2026H1','SITE-PILOT','N6','2026-01-01','2026-06-30','open',2000,'mass',NULL,NULL,NULL);

INSERT INTO conversion_factor (reference, site, factor_bp, derived_from, derived_to, derived_in_g, derived_out_g, provisional, published_by, published_on) VALUES
 ('CF-DEMO-1','SITE-DEMO',8000,'2026-01-01','2026-03-31',1000000,800000,false,'claims@example.com','2026-04-02'),
 ('CF-PILOT-1','SITE-PILOT',7500,NULL,NULL,0,0,true,'claims@example.com','2026-01-10');

INSERT INTO credit_movement (reference, period, direction, category, mass_g, reason, batch, consumption, effective_on, event_at, recorded_by, derivation) VALUES
 ('CRM-0001','BP-DEMO-N6-2026H1','in','post_consumer',360000,'consumption','BATCH-1001','CON-D1-1','2026-03-01','2026-03-01T06:30:00Z','plant@example.com','{"dry_mass_consumed_g":450000,"factor_reference":"CF-DEMO-1","factor_bp":8000}'),
 ('CRM-0002','BP-DEMO-N6-2026H1','in','pre_consumer',240000,'consumption','BATCH-1002','CON-D1-2','2026-03-01','2026-03-01T06:45:00Z','plant@example.com','{"dry_mass_consumed_g":300000,"factor_reference":"CF-DEMO-1","factor_bp":8000}'),
 ('CRM-0003','BP-DEMO-N6-2026H1','in','pre_consumer',96000,'consumption','BATCH-1004','CON-D2-2','2026-03-02','2026-03-02T06:50:00Z','plant@example.com','{"dry_mass_consumed_g":120000,"factor_reference":"CF-DEMO-1","factor_bp":8000}');

INSERT INTO carbon_method (id, version, standard, functional_unit, boundary, allocation_basis, reviewer, published_on, published_by, data_quality, emission_factors, superseded_by) VALUES
 ('CM-PA6',1,'ISO 14067','1 kg of pellet','cradle-to-gate','mass','Ilse Grootveld','2025-06-30','quality@example.com',
  '{"primary_share_threshold_bp":5000,"treatment":"TR 14049","rules":["supplier data no older than 3 years","secondary datasets named with year and region"]}',
  '[{"line":"collection_and_transport","source":"Ravel primary metering","year":2025},{"line":"process_energy","source":"Ravel primary metering","year":2026},{"line":"reagents","source":"Supplier A SDS","year":2025},{"line":"water_and_effluent","source":"Ravel primary metering","year":2026},{"line":"waste_and_residues","source":"EcoBase 2025","year":2025},{"line":"outbound_transport","source":"EcoBase 2025","year":2025},{"line":"byproduct_credit","source":"Ravel primary metering","year":2026}]',2),
 ('CM-PA6',2,'ISO 14067','1 kg of pellet','cradle-to-gate','mass','Ilse Grootveld','2026-01-20','quality@example.com',
  '{"primary_share_threshold_bp":5000,"treatment":"TR 14049","rules":["supplier data no older than 3 years","secondary datasets named with year and region"]}',
  '[{"line":"collection_and_transport","source":"Ravel primary metering","year":2026},{"line":"process_energy","source":"Ravel primary metering","year":2026},{"line":"reagents","source":"Supplier A SDS","year":2025},{"line":"water_and_effluent","source":"Ravel primary metering","year":2026},{"line":"waste_and_residues","source":"EcoBase 2025","year":2025},{"line":"outbound_transport","source":"EcoBase 2025","year":2025},{"line":"byproduct_credit","source":"Ravel primary metering","year":2026}]',NULL);

INSERT INTO energy_instrument (reference, quantity_kwh, vintage, region, state) VALUES
 ('EAC-2026-0007',250000,'2026','EU-27','retired'),
 ('EAC-2025-0031',100000,'2025','EU-27','held');
INSERT INTO energy_retirement (instrument, period, retired_kwh, retired_on, retired_by) VALUES
 ('EAC-2026-0007','BP-DEMO-N6-2026H1',250000,'2026-04-01','claims@example.com');

INSERT INTO carbon_figure (id, lot, value_mg_per_kg, boundary, method_version, uncertainty_bp, primary_share_bp, breakdown, comparator, energy_location_mg_per_kg, energy_market_mg_per_kg, metered_kwh, retired_kwh, unmatched_kwh, versions, computed_on, computed_by) VALUES
 ('CFG-0001','LOT-N6-0001',4260000,'cradle-to-gate','CM-PA6 v2',1200,6500,
  '[{"line":"collection_and_transport","mg_per_kg":310000,"tag":"primary"},{"line":"process_energy","mg_per_kg":1850000,"tag":"primary"},{"line":"reagents","mg_per_kg":1180000,"tag":"supplier_specific"},{"line":"water_and_effluent","mg_per_kg":240000,"tag":"primary"},{"line":"waste_and_residues","mg_per_kg":330000,"tag":"secondary"},{"line":"outbound_transport","mg_per_kg":410000,"tag":"secondary"},{"line":"byproduct_credit","mg_per_kg":-60000,"tag":"primary"}]',
  '{"material":"virgin PA6","dataset":"EcoBase 2025","dataset_year":2025,"region":"EU-27","value_mg_per_kg":5120000}',
  1850000,620000,300000,250000,50000,
  '{"method":{"id":"CM-PA6","version":2},"conversion_factor":"CF-DEMO-1","recipe":"RCP-DISS-2","emission_factors":{"process_energy":2026,"reagents":2025}}',
  '2026-03-14','quality@example.com');

INSERT INTO specification (grade, version, issued_on, virgin_reference, virgin_source, virgin_reference_date, rows, superseded_by) VALUES
 ('SPEC-N6',2,'2025-08-01','virgin PA6 at relative viscosity 2.42','EcoBase 2025','2025-06-30',
  '[{"property":"relative_viscosity","method":"ISO 307","limit":"2.40","unit":"ratio","basis":"guaranteed"},{"property":"moisture","method":"ISO 15512","limit":"0.10","unit":"percent","basis":"guaranteed"},{"property":"yellowness_index","method":"ASTM E313","limit":"8.0","unit":"index","basis":"typical"}]',3),
 ('SPEC-N6',3,'2026-02-01','virgin PA6 at relative viscosity 2.42','EcoBase 2025','2025-11-30',
  '[{"property":"relative_viscosity","method":"ISO 307","limit":"2.40","unit":"ratio","basis":"guaranteed"},{"property":"moisture","method":"ISO 15512","limit":"0.10","unit":"percent","basis":"guaranteed"},{"property":"yellowness_index","method":"ASTM E313","limit":"8.0","unit":"index","basis":"typical"},{"property":"ash_content","method":"ISO 3451-1","limit":"0.30","unit":"percent","basis":"informational"}]',NULL);

INSERT INTO customer (reference, name, contact, holds_specification, holds_version, application, industry) VALUES
 ('CUS-HELIOS','Helios Performance Fabrics','helios@example.com','SPEC-N6',3,'technical apparel yarn','textiles'),
 ('CUS-VANTA','Vanta Technical Textiles','vanta@example.com','SPEC-N6',2,'airbag fabric','automotive');
INSERT INTO specification_issue (grade, version, customer, issued_on, issued_by) VALUES
 ('SPEC-N6',3,'CUS-HELIOS','2026-02-01','quality@example.com'),
 ('SPEC-N6',2,'CUS-VANTA','2025-08-01','quality@example.com');
INSERT INTO conformance (customer, grade, version, application, trials, outcome, opened_on) VALUES
 ('CUS-HELIOS','SPEC-N6',3,'technical apparel yarn','[{"trial":"yarn spin trial","date":"2026-02-20","outcome":"passed"},{"trial":"dye uptake trial","date":"2026-03-05","outcome":"passed"}]','conforming','2026-02-01'),
 ('CUS-VANTA','SPEC-N6',2,'airbag fabric','[{"trial":"tensile trial","date":"2025-09-15","outcome":"passed"}]','conforming','2025-08-01');

INSERT INTO contract (id, recipient, site, period, committed_kg, floor_bp, delivered_kg, shortfall_consequence) VALUES
 ('CON-HELIOS-1','CUS-HELIOS','SITE-DEMO','2026-H1',200,5000,0,'volume rolls into the following period'),
 ('CON-VANTA-1','CUS-VANTA','SITE-COMM','2029-H1',1000,3000,0,'a make-good volume in the following period');

INSERT INTO certificate_seq (site, last) VALUES ('SITE-PILOT',2),('SITE-DEMO',0);

INSERT INTO certificate (number, version, site, lots, grade, specification_version, claim_type, content_bp, category_split, period, carbon, primary_share_bp, scheme, registration, test_results, permitted_statement, prohibited_statement, signer, signed_at, conditions, recipient, recipient_name, state, verification_url, provisional_factor, input_versions) VALUES
 ('CERT-PILOT-000001',1,'SITE-PILOT','[{"reference":"LOT-N6-0003","mass_g":200000}]','N6',2,'mass_balance',7500,'{"post_consumer":150000}','BP-PILOT-N6-2026H1','CFG-PILOT-1',6500,'RCS-2026','REG-RAVEL-0042','[]',
  'The material in this certificate represents 75.00% recycled content by mass balance, allocated by Ravel Materials SAS under scheme RCS-2026. The material is not physically segregated.',
  'You may not state that this material physically contains recycled content.',
  'signer2@example.com','2026-03-02T10:00:00Z',
  '[{"condition":"lot_released","satisfied":true,"blocking_reference":null},{"condition":"no_open_deviation","satisfied":true,"blocking_reference":null},{"condition":"no_unreviewed_override","satisfied":true,"blocking_reference":null},{"condition":"period_closed","satisfied":true,"blocking_reference":null},{"condition":"balance_invariant_holds","satisfied":true,"blocking_reference":null},{"condition":"carbon_figure_complete","satisfied":true,"blocking_reference":null},{"condition":"signer_scope","satisfied":true,"blocking_reference":null},{"condition":"signer_not_data_enterer","satisfied":true,"blocking_reference":null}]',
  'CUS-HELIOS','Helios Performance Fabrics','withdrawn','https://ravel.example.com/verify/CERT-PILOT-000001',true,
  '{"method":{"id":"CM-PA6","version":2},"conversion_factor":"CF-PILOT-1","specification":{"grade":"SPEC-N6","version":2}}'),
 ('CERT-PILOT-000002',1,'SITE-PILOT','[{"reference":"LOT-N6-0003","mass_g":200000}]','N6',2,'mass_balance',7500,'{"post_consumer":150000}','BP-PILOT-N6-2026H1','CFG-PILOT-1',6500,'RCS-2026','REG-RAVEL-0042','[]',
  'The material in this certificate represents 75.00% recycled content by mass balance, allocated by Ravel Materials SAS under scheme RCS-2026. The material is not physically segregated.',
  'You may not state that this material physically contains recycled content.',
  'signer2@example.com','2026-03-03T10:00:00Z',
  '[{"condition":"lot_released","satisfied":true,"blocking_reference":null},{"condition":"no_open_deviation","satisfied":true,"blocking_reference":null},{"condition":"no_unreviewed_override","satisfied":true,"blocking_reference":null},{"condition":"period_closed","satisfied":true,"blocking_reference":null},{"condition":"balance_invariant_holds","satisfied":true,"blocking_reference":null},{"condition":"carbon_figure_complete","satisfied":true,"blocking_reference":null},{"condition":"signer_scope","satisfied":true,"blocking_reference":null},{"condition":"signer_not_data_enterer","satisfied":true,"blocking_reference":null}]',
  'CUS-VANTA','Vanta Technical Textiles','issued','https://ravel.example.com/verify/CERT-PILOT-000002',true,
  '{"method":{"id":"CM-PA6","version":2},"conversion_factor":"CF-PILOT-1","specification":{"grade":"SPEC-N6","version":2}}');

INSERT INTO carbon_figure (id, lot, value_mg_per_kg, boundary, method_version, uncertainty_bp, primary_share_bp, breakdown, comparator, energy_location_mg_per_kg, energy_market_mg_per_kg, metered_kwh, retired_kwh, unmatched_kwh, versions, computed_on, computed_by) VALUES
 ('CFG-PILOT-1','LOT-N6-0003',4310000,'cradle-to-gate','CM-PA6 v2',1500,6100,
  '[{"line":"collection_and_transport","mg_per_kg":330000,"tag":"primary"},{"line":"process_energy","mg_per_kg":1900000,"tag":"primary"},{"line":"reagents","mg_per_kg":1220000,"tag":"supplier_specific"},{"line":"water_and_effluent","mg_per_kg":250000,"tag":"primary"},{"line":"waste_and_residues","mg_per_kg":350000,"tag":"secondary"},{"line":"outbound_transport","mg_per_kg":420000,"tag":"secondary"},{"line":"byproduct_credit","mg_per_kg":-160000,"tag":"primary"}]',
  '{"material":"virgin PA6","dataset":"EcoBase 2025","dataset_year":2025,"region":"EU-27","value_mg_per_kg":5120000}',
  1900000,640000,280000,220000,60000,
  '{"method":{"id":"CM-PA6","version":2},"conversion_factor":"CF-PILOT-1","recipe":"RCP-DISS-2"}',
  '2026-02-28','quality@example.com');

UPDATE certificate SET state='withdrawn', withdrawn_reason='A collector category was corrected after acceptance', withdrawn_by='signer2@example.com', withdrawn_on='2026-04-18',
  withdrawal_notified='{"recipients":["helios@example.com"],"void_statements":["The material in this certificate represents 75.00% recycled content by mass balance"]}'
WHERE number='CERT-PILOT-000001';

INSERT INTO credit_movement (reference, period, direction, category, mass_g, reason, origin_site, transfer, effective_on, event_at, recorded_by, derivation) VALUES
 ('CRM-0004','BP-PILOT-N6-2026H1','out','post_consumer',50000,'transfer_out','SITE-DEMO','TRF-0001','2026-05-12','2026-05-12T09:00:00Z','claims@example.com','{"transfer":"TRF-0001"}'),
 ('CRM-0005','BP-DEMO-N6-2026H1','in','post_consumer',50000,'transfer_in','SITE-PILOT','TRF-0001','2026-05-12','2026-05-12T09:00:00Z','claims@example.com','{"transfer":"TRF-0001","fresh_credit":false}');
-- the pilot period must have credit to move: pilot produced LOT-N6-0003 from claimable pilot feed
INSERT INTO credit_movement (reference, period, direction, category, mass_g, reason, batch, consumption, effective_on, event_at, recorded_by, derivation) VALUES
 ('CRM-0006','BP-PILOT-N6-2026H1','in','post_consumer',200000,'consumption',NULL,NULL,'2026-02-28','2026-02-28T10:00:00Z','plant@example.com','{"dry_mass_consumed_g":200000,"factor_reference":"CF-PILOT-1","factor_bp":7500,"note":"pilot seed credit"}');
INSERT INTO credit_movement (reference, period, direction, category, mass_g, reason, lot, effective_on, event_at, recorded_by, derivation) VALUES
 ('CRM-0007','BP-PILOT-N6-2026H1','out','post_consumer',150000,'allocation','LOT-N6-0003','2026-03-02','2026-03-02T09:00:00Z','claims@example.com','{"lot":"LOT-N6-0003"}');
INSERT INTO allocation (reference, period, lot, category, mass_g, allocated_by, allocated_on) VALUES
 ('ALC-0001','BP-PILOT-N6-2026H1','LOT-N6-0003','post_consumer',150000,'claims@example.com','2026-03-02');

INSERT INTO transfer (reference, from_period, to_period, mass_g, category, effective_on, moved_by) VALUES
 ('TRF-0001','BP-PILOT-N6-2026H1','BP-DEMO-N6-2026H1',50000,'post_consumer','2026-05-12','claims@example.com');

INSERT INTO inbound_record (reference, source, received_at, payload_verbatim, payload) VALUES
 ('INB-0001','weighbridge','2026-02-20T06:14:00Z','{"device":"WB-DEMO-02","ticket":"T-88214","gross_kg":124.0,"tare_kg":4.0,"net_kg":120.0,"calibrated_on":"2025-02-01","batch":"BATCH-1004"}','{"device":"WB-DEMO-02","ticket":"T-88214","gross_kg":124.0,"tare_kg":4.0,"net_kg":120.0,"calibrated_on":"2025-02-01","batch":"BATCH-1004"}'),
 ('INB-0002','control_system','2026-03-04T22:41:00Z','{"run":"RUN-D-0001","achieved":{"temperature":165,"pressure":3,"residence_minutes":92}}','{"run":"RUN-D-0001","achieved":{"temperature":165,"pressure":3,"residence_minutes":92}}'),
 ('INB-0003','laboratory','2026-03-06T09:02:00Z','{"lot":"LOT-N6-0001","property":"relative_viscosity","method":"ISO 307","value":2.44,"unit":"ratio"}','{"lot":"LOT-N6-0001","property":"relative_viscosity","method":"ISO 307","value":2.44,"unit":"ratio"}');

-- legal hold HLD-0001 is attached to the CERT-PILOT-000001 signing entry by the boot fixup

INSERT INTO statistic (key, value, source, year, geography) VALUES
 ('textiles_recycled','Less than 1 per cent of textiles are recycled into new materials','Textile Flow Monitor','2024','Global'),
 ('plastics_emissions','1.8 gigatonnes of carbon dioxide equivalent a year from plastics production','Global Materials Emissions Panel','2023','Global'),
 ('textile_incineration','More than 8 per cent of textile waste is incinerated each year','Textile Flow Monitor','2024','EU-27');

INSERT INTO position (reference, title, location, department, contract_type, closes_on) VALUES
 ('POS-0001','Process Engineer','Lyon, France','Operations','Permanent','2026-11-30');

INSERT INTO news_item (title, tag, outlet, date, link, language) VALUES
 ('Series A closes at 40 million euros','funding','Materials Weekly','2026-01-22','https://materialsw.example.com/series-a','en'),
 ('Offtake agreement signed for demonstration output','partnership','Fibre Report','2026-03-11','https://fibrereport.example.com/offtake','en'),
 ('Depolymerisation yield published','technical','Chimie Circulaire','2026-05-06','https://chimiecirculaire.example.com/rendement','fr');

INSERT INTO claim_substantiation (claim, route, first_published, evidence, method_version, approver, review_date) VALUES
 ('Low-carbon: 4260000 mg CO2e per kg against virgin PA6 at 5120000 mg CO2e per kg','/technology','2026-01-20','LOT-N6-0001 carbon figure CFG-0001, comparator EcoBase 2025 EU-27','CM-PA6 v2','Marit Solheim','2027-01-20'),
 ('Less than 1 per cent of textiles are recycled into new materials','/about','2026-01-05','Textile Flow Monitor 2024, Global','Textile Flow Monitor 2024','Marit Solheim','2027-01-05'),
 ('Low temperature and pressure: dissolution at 165 C and 3 bar','/technology','2026-01-20','Recipe RCP-DISS-2 tolerances, run RUN-D-0001','RCP-DISS-2','Marit Solheim','2027-01-20');

INSERT INTO site_certification (site, state, valid_from, valid_to, effective_from, recorded_on, recorded_by) VALUES
 ('SITE-PILOT','certified','2025-10-01','2027-09-30','2025-10-01','2025-10-01','quality@example.com'),
 ('SITE-DEMO','certified','2025-10-01','2027-09-30','2025-10-01','2025-10-01','quality@example.com');

INSERT INTO access_grant (email, role, site, valid_from, valid_to) VALUES
 ('plant@example.com','plant_operator','SITE-DEMO','2026-01-01','2027-06-30'),
 ('plant@example.com','plant_operator','SITE-PILOT','2026-01-01','2027-06-30'),
 ('analyst@example.com','lab_analyst','SITE-DEMO','2026-01-01','2027-06-30'),
 ('analyst@example.com','lab_analyst','SITE-PILOT','2026-01-01','2027-06-30'),
 ('quality@example.com','quality_manager','SITE-DEMO','2026-01-01','2027-06-30'),
 ('quality@example.com','quality_manager','SITE-PILOT','2026-01-01','2027-06-30'),
 ('claims@example.com','claims_manager','SITE-DEMO','2026-01-01','2027-06-30'),
 ('claims@example.com','claims_manager','SITE-PILOT','2026-01-01','2027-06-30'),
 ('signer@example.com','certificate_signer','SITE-DEMO','2026-01-01','2027-06-30'),
 ('signer@example.com','certificate_signer','SITE-PILOT','2026-01-01','2027-06-30'),
 ('signer2@example.com','certificate_signer','SITE-PILOT','2026-01-01','2027-06-30'),
 ('auditor@example.com','auditor','SITE-DEMO','2026-01-01','2027-06-30'),
 ('auditor@example.com','auditor','SITE-PILOT','2026-01-01','2027-06-30');

INSERT INTO record_entry (at, act, person, site, object, detail, refused, digest, prev_digest, content) VALUES
 ('2026-01-01T00:00:00Z','collector_approved','quality@example.com',NULL,'COL-ALDER','{"state":"approved","valid_from":"2026-01-01","valid_to":"2026-12-31"}',NULL,'',repeat('0',64),NULL),
 ('2026-01-01T00:00:01Z','collector_approved','quality@example.com',NULL,'COL-BRINE','{"state":"approved","valid_from":"2026-01-01","valid_to":"2026-06-30"}',NULL,'','',NULL),
 ('2026-01-01T00:00:02Z','collector_approved','quality@example.com',NULL,'COL-CINDER','{"state":"conditional","valid_from":"2026-01-01","valid_to":"2026-12-31"}',NULL,'','',NULL),
 ('2026-02-10T08:40:00Z','batch_booked','plant@example.com','SITE-DEMO','BATCH-1001','{"net_g":500000}',NULL,'','',NULL),
 ('2026-02-10T08:41:00Z','weighing_recorded','plant@example.com','SITE-DEMO','BATCH-1001','{"device":"WB-DEMO-01","calibration":"valid"}',NULL,'','',NULL),
 ('2026-02-12T07:15:00Z','batch_booked','plant@example.com','SITE-DEMO','BATCH-1002','{"net_g":300000}',NULL,'','',NULL),
 ('2026-02-20T06:14:00Z','batch_booked','plant@example.com','SITE-DEMO','BATCH-1004','{"net_g":120000}',NULL,'','',NULL),
 ('2026-02-20T06:15:00Z','weighing_recorded','plant@example.com','SITE-DEMO','BATCH-1004','{"device":"WB-DEMO-02","calibration":"lapsed"}',NULL,'','',NULL),
 ('2026-03-01T06:00:00Z','run_started','plant@example.com','SITE-DEMO','RUN-D-0001','{"run_type":"dissolution"}',NULL,'','',NULL),
 ('2026-03-01T06:30:00Z','consumption_recorded','plant@example.com','SITE-DEMO','CON-D1-1','{"mass_g":300000}',NULL,'','',NULL),
 ('2026-03-01T06:45:00Z','consumption_recorded','plant@example.com','SITE-DEMO','CON-D1-2','{"mass_g":300000}',NULL,'','',NULL),
 ('2026-03-01T14:00:00Z','run_closed','plant@example.com','SITE-DEMO','RUN-D-0001','{"losses_g":120000}',NULL,'','',NULL),
 ('2026-03-02T06:00:00Z','run_started','plant@example.com','SITE-DEMO','RUN-D-0002','{"run_type":"dissolution"}',NULL,'','',NULL),
 ('2026-03-02T06:30:00Z','consumption_recorded','plant@example.com','SITE-DEMO','CON-D2-1','{"mass_g":190000}',NULL,'','',NULL),
 ('2026-03-02T06:50:00Z','consumption_recorded','plant@example.com','SITE-DEMO','CON-D2-2','{"mass_g":120000}',NULL,'','',NULL),
 ('2026-03-02T15:00:00Z','run_closed','plant@example.com','SITE-DEMO','RUN-D-0002','{"losses_g":60000}',NULL,'','',NULL),
 ('2026-03-03T00:00:00Z','deviation_raised','quality@example.com','SITE-DEMO','DEV-0002','{"description":"Dissolution pressure excursion on RUN-D-0002"}',NULL,'','',NULL),
 ('2026-03-04T06:00:00Z','run_started','plant@example.com','SITE-DEMO','RUN-D-0003','{"run_type":"dissolution"}',NULL,'','',NULL),
 ('2026-03-04T06:30:00Z','consumption_recorded','plant@example.com','SITE-DEMO','CON-D3-1','{"mass_g":150000}',NULL,'','',NULL),
 ('2026-03-04T12:00:00Z','run_closed','plant@example.com','SITE-DEMO','RUN-D-0003','{"losses_g":30000}',NULL,'','',NULL),
 ('2026-03-06T08:00:00Z','run_started','plant@example.com','SITE-DEMO','RUN-Y-0001','{"run_type":"depolymerisation"}',NULL,'','',NULL),
 ('2026-03-06T08:30:00Z','consumption_recorded','plant@example.com','SITE-DEMO','CON-Y1-1','{"mass_g":480000}',NULL,'','',NULL),
 ('2026-03-07T02:00:00Z','run_closed','plant@example.com','SITE-DEMO','RUN-Y-0001','{"losses_g":50000}',NULL,'','',NULL),
 ('2026-03-08T04:00:00Z','run_started','plant@example.com','SITE-DEMO','RUN-U-0001','{"run_type":"purification"}',NULL,'','',NULL),
 ('2026-03-08T20:00:00Z','run_closed','plant@example.com','SITE-DEMO','RUN-U-0001','{"losses_g":40000}',NULL,'','',NULL),
 ('2026-03-10T02:00:00Z','run_started','plant@example.com','SITE-DEMO','RUN-R-0001','{"run_type":"repolymerisation"}',NULL,'','',NULL),
 ('2026-03-11T10:00:00Z','run_closed','plant@example.com','SITE-DEMO','RUN-R-0001','{"losses_g":20000}',NULL,'','',NULL),
 ('2026-03-12T00:00:00Z','test_result_recorded','analyst@example.com','SITE-DEMO','TST-0001','{"property":"relative_viscosity","value":2.44}',NULL,'','',NULL),
 ('2026-03-12T00:00:00Z','deviation_raised','quality@example.com','SITE-DEMO','DEV-0001','{"description":"Purification holdup above recipe window on RUN-U-0001"}',NULL,'','',NULL),
 ('2026-03-14T00:00:00Z','carbon_figure_computed','quality@example.com','SITE-DEMO','CFG-0001','{"value_mg_per_kg":4260000}',NULL,'','',NULL),
 ('2026-03-18T00:00:00Z','override_recorded','quality@example.com','SITE-DEMO','OVR-0001','{"separation":"analyst_not_dispositioner"}',NULL,'','',NULL),
 ('2026-03-20T00:00:00Z','disposition_set','quality@example.com','SITE-DEMO','LOT-N6-0001','{"disposition":"released"}',NULL,'','',NULL),
 ('2026-03-02T10:00:00Z','certificate_signed','signer2@example.com','SITE-PILOT','CERT-PILOT-000001','{"content_bp":7500}',NULL,'','',NULL),
 ('2026-03-03T10:00:00Z','certificate_signed','signer2@example.com','SITE-PILOT','CERT-PILOT-000002','{"content_bp":7500}',NULL,'','',NULL),
 ('2026-04-18T00:00:00Z','certificate_withdrawn','signer2@example.com','SITE-PILOT','CERT-PILOT-000001','{"reason":"A collector category was corrected after acceptance"}',NULL,'','',NULL),
 ('2026-04-18T00:00:01Z','legal_hold_placed','auditor@example.com',NULL,'HLD-0001','{"seq":null}',NULL,'','',NULL),
 ('2026-05-12T09:00:00Z','period_transfer','claims@example.com','SITE-DEMO','TRF-0001','{"mass_g":50000}',NULL,'','',NULL);

COMMIT;
