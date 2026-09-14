-- Seed for Ravel. Every reference matches the brief's tables exactly.

INSERT INTO sites VALUES
 ('SITE-PILOT','Pilot','commissioned',40000,24000,'8000 hours per year, 0.90 availability, 0.80 yield','certified','2026-06-30'),
 ('SITE-DEMO','Demonstration','commissioned',400000,320000,'8000 hours per year, 0.90 availability, 0.80 yield','certified','2026-06-30'),
 ('SITE-COMM','Commercial','planned',25000000,26000000,'8000 hours per year, 0.90 availability, 0.80 yield','not_certified','2026-06-30')
ON CONFLICT DO NOTHING;

INSERT INTO grants (email,name,role,sites,ends_on) VALUES
 ('plant@example.com','Ines Bekele','plant_operator','{SITE-DEMO,SITE-PILOT}','2027-06-30'),
 ('analyst@example.com','Tomas Vlach','lab_analyst','{SITE-DEMO,SITE-PILOT}','2027-06-30'),
 ('quality@example.com','Marit Solheim','quality_manager','{SITE-DEMO,SITE-PILOT}','2027-06-30'),
 ('claims@example.com','Osei Danquah','claims_manager','{SITE-DEMO,SITE-PILOT}','2027-06-30'),
 ('signer@example.com','Hana Ferreira','certificate_signer','{SITE-DEMO,SITE-PILOT}','2027-06-30'),
 ('signer2@example.com','Pavel Ostrowski','certificate_signer','{SITE-PILOT}','2027-06-30'),
 ('auditor@example.com','Ruth Lindqvist','auditor','{SITE-DEMO,SITE-PILOT}','2027-06-30')
ON CONFLICT DO NOTHING;

INSERT INTO parties VALUES
 ('COL-ALDER','collector'),('COL-BRINE','collector'),('COL-CINDER','collector'),
 ('CUS-HELIOS','customer'),('CUS-VANTA','customer'),
 ('RAVEL','producer')
ON CONFLICT DO NOTHING;

INSERT INTO party_versions (party,name,effective_from) VALUES
 ('COL-ALDER','Alder Reclaim','2026-01-01'),
 ('COL-BRINE','Brine Textile Recovery','2026-01-01'),
 ('COL-BRINE','Brine Circular Materials','2026-08-01'),
 ('COL-CINDER','Cinder Industrial Offcuts','2026-01-01'),
 ('CUS-HELIOS','Helios Sportswear','2026-01-01'),
 ('CUS-VANTA','Vanta Autotextiles','2026-01-01'),
 ('RAVEL','Ravel Materials SAS','2026-01-01')
ON CONFLICT DO NOTHING;

INSERT INTO collectors VALUES
 ('COL-ALDER','COL-ALDER','PT','WCR-PT-4471','2027-03-31','{industrial_laundry,kerbside}','{post_consumer_nets,pre_consumer_offcuts}','certified'),
 ('COL-BRINE','COL-BRINE','NL','WCR-NL-2208','2027-01-31','{kerbside}','{post_consumer_textiles}','certified'),
 ('COL-CINDER','COL-CINDER','FR','WCR-FR-6613','2026-12-31','{industrial_site}','{pre_consumer_offcuts}','certified')
ON CONFLICT DO NOTHING;

INSERT INTO approval_periods (collector,state,valid_from,valid_to,condition,condition_closes_on) VALUES
 ('COL-ALDER','approved','2026-01-01','2026-12-31',NULL,NULL),
 ('COL-BRINE','approved','2026-01-01','2026-06-30',NULL,NULL),
 ('COL-CINDER','conditional','2026-01-01','2026-12-31','Sampling plan for coated streams to be agreed','2026-10-31')
ON CONFLICT DO NOTHING;

INSERT INTO devices VALUES
 ('WB-DEMO-01','SITE-DEMO','2026-05-01'),
 ('WB-DEMO-02','SITE-DEMO','2025-02-01')
ON CONFLICT DO NOTHING;

INSERT INTO batches (reference,collector,site,grade,category,gross_g,tare_g,net_g,moisture_bp,moisture_method,device,received_on,composition,contamination,custody,accepted_g,rejected_g) VALUES
 ('BATCH-1001','COL-ALDER','SITE-DEMO','N6','post_consumer',502000,2000,500000,1000,'ISO 15512','WB-DEMO-01','2026-02-10',
  '[{"polymer":"PA6","fraction_bp":9200,"basis":"sampled","measured_fraction_bp":9200,"elastane_bp":400}]'::jsonb,
  '{"non_nylon_bp":300,"elastane_bp":400,"coatings":"none","colour_load":"dark","foreign_matter":"low"}'::jsonb,
  '[{"kind":"collection_site","on":"2026-02-08","party":"COL-ALDER"},{"kind":"collector","on":"2026-02-08","party":"COL-ALDER"},{"kind":"transport","on":"2026-02-09","party":"COL-ALDER"},{"kind":"arrival","on":"2026-02-10","party":"RAVEL"},{"kind":"weighing","on":"2026-02-10","party":"RAVEL"},{"kind":"acceptance","on":"2026-02-10","party":"RAVEL"}]'::jsonb,
  500000,0),
 ('BATCH-1002','COL-ALDER','SITE-DEMO','N6','pre_consumer',302000,2000,300000,0,'ISO 15512','WB-DEMO-01','2026-02-12',
  '[{"polymer":"PA6","fraction_bp":9500,"basis":"declared"}]'::jsonb,
  '{"non_nylon_bp":200,"elastane_bp":0,"coatings":"none","colour_load":"mixed","foreign_matter":"low"}'::jsonb,
  '[{"kind":"collection_site","on":"2026-02-10","party":"COL-ALDER"},{"kind":"collector","on":"2026-02-10","party":"COL-ALDER"},{"kind":"transport","on":"2026-02-11","party":"COL-ALDER"},{"kind":"arrival","on":"2026-02-12","party":"RAVEL"},{"kind":"weighing","on":"2026-02-12","party":"RAVEL"},{"kind":"acceptance","on":"2026-02-12","party":"RAVEL"}]'::jsonb,
  300000,0),
 ('BATCH-1003','COL-BRINE','SITE-DEMO','N6','post_consumer',201000,1000,200000,500,'ISO 15512','WB-DEMO-01','2026-07-05',
  '[{"polymer":"PA6","fraction_bp":8800,"basis":"declared"}]'::jsonb,
  '{"non_nylon_bp":600,"elastane_bp":600,"coatings":"printed","colour_load":"mixed","foreign_matter":"medium"}'::jsonb,
  '[{"kind":"collection_site","on":"2026-07-03","party":"COL-BRINE"},{"kind":"collector","on":"2026-07-03","party":"COL-BRINE"},{"kind":"transport","on":"2026-07-04","party":"COL-BRINE"},{"kind":"arrival","on":"2026-07-05","party":"RAVEL"},{"kind":"weighing","on":"2026-07-05","party":"RAVEL"},{"kind":"acceptance","on":"2026-07-05","party":"RAVEL"}]'::jsonb,
  200000,0),
 ('BATCH-1004','COL-CINDER','SITE-DEMO','N6','pre_consumer',120500,500,120000,0,'ISO 15512','WB-DEMO-02','2026-02-20',
  '[{"polymer":"PA6","fraction_bp":9900,"basis":"declared","measured_fraction_bp":9100}]'::jsonb,
  '{"non_nylon_bp":100,"elastane_bp":0,"coatings":"none","colour_load":"light","foreign_matter":"low"}'::jsonb,
  '[{"kind":"collection_site","on":"2026-02-18","party":"COL-CINDER"},{"kind":"collector","on":"2026-02-18","party":"COL-CINDER"},{"kind":"transport","on":"2026-02-19","party":"COL-CINDER"},{"kind":"arrival","on":"2026-02-20","party":"RAVEL"},{"kind":"weighing","on":"2026-02-20","party":"RAVEL"},{"kind":"acceptance","on":"2026-02-20","party":"RAVEL"}]'::jsonb,
  120000,0),
 ('BATCH-1005','COL-ALDER','SITE-DEMO','N6','post_consumer',100800,800,100000,0,'ISO 15512','WB-DEMO-01','2026-03-02',
  '[{"polymer":"PA6","fraction_bp":9000,"basis":"declared"}]'::jsonb,
  '{"non_nylon_bp":500,"elastane_bp":500,"coatings":"none","colour_load":"dark","foreign_matter":"low"}'::jsonb,
  '[{"kind":"collection_site","on":"2026-03-01","party":"COL-ALDER"},{"kind":"collector","on":"2026-03-01","party":"COL-ALDER"},{"kind":"arrival","on":"2026-03-02","party":"RAVEL"},{"kind":"weighing","on":"2026-03-02","party":"RAVEL"},{"kind":"acceptance","on":"2026-03-02","party":"RAVEL"}]'::jsonb,
  100000,0)
ON CONFLICT DO NOTHING;

UPDATE batches SET custody = '[{"kind":"collection_site","on":"2026-02-18","party":"COL-CINDER"},{"kind":"collector","on":"2026-02-18","party":"COL-CINDER"},{"kind":"transport","on":"2026-02-19","party":"COL-CINDER"},{"kind":"arrival","on":"2026-02-20","party":"RAVEL"},{"kind":"weighing","on":"2026-02-20","party":"RAVEL"},{"kind":"acceptance","on":"2026-02-20","party":"RAVEL"}]'::jsonb WHERE reference='BATCH-1004';

INSERT INTO findings (reference,collector,batch,description,departure_bp,state,opened_on) VALUES
 ('FND-0001','COL-CINDER','BATCH-1004','Measured composition departs from the declaration by 800 basis points (declared 9900, measured 9100).',800,'open','2026-03-01')
ON CONFLICT DO NOTHING;

INSERT INTO runs (reference,run_type,site,equipment,recipe_version,operator,started_at,closed_at,losses_g,actual_setpoints,within_tolerance) VALUES
 ('RUN-D-0001','dissolution','SITE-DEMO','DISS-LINE-1','RCP-DISS-2','plant@example.com','2026-03-01T08:00:00Z','2026-03-01T16:00:00Z',120000,'{"temperature":165,"pressure":3,"residence_minutes":95}'::jsonb,true),
 ('RUN-D-0002','dissolution','SITE-DEMO','DISS-LINE-1','RCP-DISS-2','plant@example.com','2026-03-01T18:00:00Z','2026-03-02T02:00:00Z',60000,'{"temperature":161,"pressure":3,"residence_minutes":100}'::jsonb,true),
 ('RUN-D-0003','dissolution','SITE-DEMO','DISS-LINE-1','RCP-DISS-2','plant@example.com','2026-03-03T08:00:00Z','2026-03-03T14:00:00Z',30000,'{"temperature":163,"pressure":2,"residence_minutes":97}'::jsonb,true),
 ('RUN-Y-0001','depolymerisation','SITE-DEMO','DEPO-REACT-2','RCP-DEPO-4','plant@example.com','2026-03-04T06:00:00Z','2026-03-04T20:00:00Z',50000,'{"temperature":272,"pressure":11}'::jsonb,true),
 ('RUN-U-0001','purification','SITE-DEMO','PUR-COL-1','RCP-PURI-1','plant@example.com','2026-03-05T06:00:00Z','2026-03-05T18:00:00Z',40000,'{"temperature":88,"pressure":1}'::jsonb,true),
 ('RUN-R-0001','repolymerisation','SITE-DEMO','REPO-REACT-1','RCP-REPO-3','plant@example.com','2026-03-06T06:00:00Z','2026-03-06T22:00:00Z',20000,'{"temperature":258,"pressure":9}'::jsonb,true)
ON CONFLICT DO NOTHING;

INSERT INTO consumptions (run,batch,input_reference,input_kind,mass_g,effective_on) VALUES
 ('RUN-D-0001','BATCH-1001','BATCH-1001','batch',300000,'2026-03-01'),
 ('RUN-D-0001','BATCH-1002','BATCH-1002','batch',300000,'2026-03-01'),
 ('RUN-D-0002','BATCH-1003','BATCH-1003','batch',190000,'2026-03-01'),
 ('RUN-D-0002','BATCH-1004','BATCH-1004','batch',120000,'2026-03-01'),
 ('RUN-D-0003','BATCH-1001','BATCH-1001','batch',150000,'2026-03-03'),
 ('RUN-Y-0001',NULL,'OUT-D-0001','intermediate',480000,'2026-03-04'),
 ('RUN-Y-0001',NULL,'OUT-D-0002','intermediate',250000,'2026-03-04'),
 ('RUN-Y-0001',NULL,'OUT-D-0003','intermediate',120000,'2026-03-04'),
 ('RUN-U-0001',NULL,'OUT-Y-0001','intermediate',800000,'2026-03-05'),
 ('RUN-R-0001',NULL,'OUT-U-0001','intermediate',720000,'2026-03-06')
ON CONFLICT DO NOTHING;

INSERT INTO outputs (reference,run,kind,mass_g,disposition,lot) VALUES
 ('OUT-D-0001','RUN-D-0001','intermediate',480000,NULL,NULL),
 ('OUT-D-0002','RUN-D-0002','intermediate',250000,NULL,NULL),
 ('OUT-D-0003','RUN-D-0003','intermediate',120000,NULL,NULL),
 ('OUT-Y-0001','RUN-Y-0001','intermediate',800000,NULL,NULL),
 ('OUT-U-0001','RUN-U-0001','intermediate',720000,NULL,NULL),
 ('OUT-U-0002','RUN-U-0001','byproduct',40000,'sold',NULL),
 ('LOT-N6-0001','RUN-R-0001','lot',400000,NULL,'LOT-N6-0001'),
 ('LOT-N6-0002','RUN-R-0001','lot',300000,NULL,'LOT-N6-0002')
ON CONFLICT DO NOTHING;

INSERT INTO lots (reference,grade,site,run,mass_g,disposition,claim_type) VALUES
 ('LOT-N6-0001','N6','SITE-DEMO','RUN-R-0001',400000,'released','mass_balance'),
 ('LOT-N6-0002','N6','SITE-DEMO','RUN-R-0001',300000,'quarantined','mass_balance')
ON CONFLICT DO NOTHING;

INSERT INTO lots (reference,grade,site,run,mass_g,disposition,claim_type,blended_from) VALUES
 ('LOT-N6-0003','N6','SITE-PILOT',NULL,200000,'released','mass_balance',NULL)
ON CONFLICT DO NOTHING;

INSERT INTO test_results (reference,subject_kind,subject,property,method,instrument,analyst,value,unit,uncertainty_bp,method_mismatch,usable_for_release) VALUES
 ('TR-0001','lot','LOT-N6-0001','relative_viscosity','ISO 307','VISC-2','analyst@example.com','2.45','ratio',900,false,true),
 ('TR-0002','lot','LOT-N6-0001','moisture','ISO 15512','KF-1','analyst@example.com','0.06','percent',400,false,true),
 ('TR-0003','lot','LOT-N6-0001','yellowness_index','ASTM E313','SPECT-4','analyst@example.com','6.1','index',700,false,true),
 ('TR-0004','batch','BATCH-1004','composition','ISO 3451-1','ASH-1','analyst@example.com','9100','basis_points',500,false,true)
ON CONFLICT DO NOTHING;

INSERT INTO deviations (reference,state,raised_by,reason,outcome,opened_at,closed_at) VALUES
 ('DEV-0001','open','quality@example.com','Purification column pressure excursion on RUN-U-0001; specification risk on LOT-N6-0002.',NULL,'2026-03-05T12:00:00Z',NULL),
 ('DEV-0002','closed','quality@example.com','Dissolution yield below expectation on RUN-D-0002.','cause_not_established','2026-03-02T06:00:00Z','2026-04-01T09:00:00Z')
ON CONFLICT DO NOTHING;

INSERT INTO deviation_subjects (deviation,subject_kind,subject) VALUES
 ('DEV-0001','run','RUN-U-0001'),('DEV-0001','lot','LOT-N6-0002'),
 ('DEV-0002','run','RUN-D-0002')
ON CONFLICT DO NOTHING;

INSERT INTO overrides (reference,separation,reason,lot,authorised_by,authorised_on,reviewed) VALUES
 ('OVR-0001','analyst_not_dispositioner','Night shift analyst dispositioned the lot because no second qualified person was on site','LOT-N6-0001','quality@example.com','2026-03-18',false)
ON CONFLICT DO NOTHING;

INSERT INTO balance_periods (id,site,grade,period_from,period_to,state,carry_over_limit_bp,allocation_basis,closed_on,cut_off,closed_by) VALUES
 ('BP-DEMO-N6-2025H2','SITE-DEMO','N6','2025-07-01','2025-12-31','closed',2000,'mass','2026-01-15','2026-01-10','claims@example.com'),
 ('BP-DEMO-N6-2026H1','SITE-DEMO','N6','2026-01-01','2026-06-30','open',2000,'mass',NULL,NULL,NULL),
 ('BP-PILOT-N6-2026H1','SITE-PILOT','N6','2026-01-01','2026-06-30','open',2000,'mass',NULL,NULL,NULL)
ON CONFLICT DO NOTHING;

INSERT INTO conversion_factors (reference,site,factor_bp,derived_from,derived_to,derived_in_g,derived_out_g,provisional,published_on,published_by) VALUES
 ('CF-DEMO-1','SITE-DEMO',8000,'2026-01-01','2026-03-31',1000000,800000,false,'2026-04-01','claims@example.com'),
 ('CF-PILOT-1','SITE-PILOT',7500,NULL,NULL,0,0,true,'2026-02-01','claims@example.com')
ON CONFLICT DO NOTHING;

INSERT INTO credit_movements (reference,period,category,direction,mass_g,reason,lot,origin_site,movement,effective_on,recorded_at) VALUES
 ('CRM-0001','BP-DEMO-N6-2026H1','post_consumer','in',360000,'Credit granted at consumption of BATCH-1001 by RUN-D-0001 and RUN-D-0003 (dry mass 450000 g at 8000 bp).',NULL,NULL,NULL,'2026-03-01','2026-03-01T08:00:00Z'),
 ('CRM-0002','BP-DEMO-N6-2026H1','pre_consumer','in',240000,'Credit granted at consumption of BATCH-1002 by RUN-D-0001 (dry mass 300000 g at 8000 bp).',NULL,NULL,NULL,'2026-03-01','2026-03-01T08:00:00Z'),
 ('CRM-0003','BP-DEMO-N6-2026H1','pre_consumer','in',96000,'Credit granted at consumption of BATCH-1004 by RUN-D-0002 (dry mass 120000 g at 8000 bp).',NULL,NULL,NULL,'2026-03-01','2026-03-01T18:00:00Z'),
 ('CRM-0004','BP-DEMO-N6-2026H1','post_consumer','in',50000,'Inbound credit from inter-site transfer TRF-0001 from SITE-PILOT.',NULL,'SITE-PILOT','TRF-0001','2026-05-12','2026-05-12T09:00:00Z'),
 ('CRM-0005','BP-PILOT-N6-2026H1','post_consumer','out',50000,'Credit moved to BP-DEMO-N6-2026H1 by inter-site transfer TRF-0001.',NULL,'SITE-DEMO','TRF-0001','2026-05-12','2026-05-12T09:00:00Z')
ON CONFLICT DO NOTHING;

INSERT INTO transfers (reference,from_period,to_period,mass_g,category,moved_on) VALUES
 ('TRF-0001','BP-PILOT-N6-2026H1','BP-DEMO-N6-2026H1',50000,'post_consumer','2026-05-12')
ON CONFLICT DO NOTHING;

INSERT INTO credit_movements (reference,period,category,direction,mass_g,reason,lot,origin_site,movement,effective_on,recorded_at) VALUES
 ('CRM-0006','BP-PILOT-N6-2026H1','post_consumer','in',200000,'Credit granted at consumption of SITE-PILOT feedstock (dry mass 200000 g at the provisional factor of the pilot site).',NULL,NULL,NULL,'2026-03-01','2026-03-01T07:00:00Z'),
 ('CRM-0007','BP-PILOT-N6-2026H1','post_consumer','out',150000,'Claim attached to LOT-N6-0003 by claims@example.com.',NULL,NULL,NULL,'2026-03-02','2026-03-02T09:00:00Z')
ON CONFLICT DO NOTHING;
UPDATE credit_movements SET lot='LOT-N6-0003' WHERE reference='CRM-0007';

INSERT INTO carbon_methods (id,version,standard,functional_unit,boundary,allocation_basis,reviewer,published_on,published_by,data_quality_rules,emission_factors,superseded_by) VALUES
 ('CM-PA6',2,'ISO 14067','1 kg of pellet','cradle-to-gate','mass','Ilse Grootveld','2026-01-20','quality@example.com',
  '{"primary_share_threshold_bp":5000,"comparator_update_rule":"annual","energy_matching_rule":"retired instruments only, vintage and region matched"}'::jsonb,
  '[{"line":"collection_and_transport","source":"Measured collector data","year":2026},{"line":"process_energy","source":"Site metering","year":2026},{"line":"reagents","source":"Supplier EPD set","year":2025},{"line":"water_and_effluent","source":"Site metering","year":2026},{"line":"waste_and_residues","source":"EcoBase 2025","year":2025},{"line":"outbound_transport","source":"EcoBase 2025","year":2025},{"line":"byproduct_credit","source":"Measured collector data","year":2026}]'::jsonb, NULL),
 ('CM-PA6',1,'ISO 14067','1 kg of pellet','cradle-to-gate','mass','Ilse Grootveld','2025-07-02','quality@example.com',
  '{"primary_share_threshold_bp":5000,"comparator_update_rule":"annual","energy_matching_rule":"retired instruments only, vintage and region matched"}'::jsonb,
  '[{"line":"collection_and_transport","source":"Measured collector data","year":2025},{"line":"process_energy","source":"Site metering","year":2025},{"line":"reagents","source":"Supplier EPD set","year":2024},{"line":"water_and_effluent","source":"Site metering","year":2025},{"line":"waste_and_residues","source":"EcoBase 2024","year":2024},{"line":"outbound_transport","source":"EcoBase 2024","year":2024},{"line":"byproduct_credit","source":"Measured collector data","year":2025}]'::jsonb, 2)
ON CONFLICT DO NOTHING;

INSERT INTO energy_instruments (reference,quantity_kwh,vintage,region,state) VALUES
 ('EAC-2026-0007',250000,2026,'EU-27','retired'),
 ('EAC-2025-0031',100000,2025,'EU-27','held')
ON CONFLICT DO NOTHING;

INSERT INTO energy_retirements (instrument,period,quantity_kwh,retired_on) VALUES
 ('EAC-2026-0007','BP-DEMO-N6-2026H1',250000,'2026-05-12')
ON CONFLICT DO NOTHING;

INSERT INTO carbon_figures (id,lot,method_id,method_version,value_mg_per_kg,uncertainty_bp,primary_share_bp,breakdown,comparator,energy,computed_against,computed_at) VALUES
 ('CFG-0001','LOT-N6-0001','CM-PA6',2,4260000,1200,6500,
  '[{"line":"collection_and_transport","mg_per_kg":310000,"tag":"primary"},{"line":"process_energy","mg_per_kg":1850000,"tag":"primary"},{"line":"reagents","mg_per_kg":1180000,"tag":"supplier_specific"},{"line":"water_and_effluent","mg_per_kg":240000,"tag":"primary"},{"line":"waste_and_residues","mg_per_kg":330000,"tag":"secondary"},{"line":"outbound_transport","mg_per_kg":410000,"tag":"secondary"},{"line":"byproduct_credit","mg_per_kg":-60000,"tag":"primary"}]'::jsonb,
  '{"material":"virgin PA6","dataset":"EcoBase 2025","dataset_year":2025,"region":"EU-27"}'::jsonb,
  '{"energy_location_mg_per_kg":1850000,"energy_market_mg_per_kg":620000,"metered_kwh":300000,"retired_kwh":250000,"unmatched_kwh":50000}'::jsonb,
  '{"conversion_factor":"CF-DEMO-1","carbon_method":{"id":"CM-PA6","version":2},"allocation_basis":"mass"}'::jsonb,
  '2026-03-08T10:00:00Z')
ON CONFLICT DO NOTHING;

INSERT INTO carbon_figures (id,lot,method_id,method_version,value_mg_per_kg,uncertainty_bp,primary_share_bp,breakdown,comparator,energy,computed_against,computed_at) VALUES
 ('CFG-PILOT-0001','LOT-N6-0003','CM-PA6',2,5480000,1500,6100,
  '[{"line":"collection_and_transport","mg_per_kg":520000,"tag":"primary"},{"line":"process_energy","mg_per_kg":2350000,"tag":"primary"},{"line":"reagents","mg_per_kg":1520000,"tag":"supplier_specific"},{"line":"water_and_effluent","mg_per_kg":310000,"tag":"primary"},{"line":"waste_and_residues","mg_per_kg":420000,"tag":"secondary"},{"line":"outbound_transport","mg_per_kg":520000,"tag":"secondary"},{"line":"byproduct_credit","mg_per_kg":-160000,"tag":"primary"}]'::jsonb,
  '{"material":"virgin PA6","dataset":"EcoBase 2025","dataset_year":2025,"region":"EU-27"}'::jsonb,
  '{"energy_location_mg_per_kg":2350000,"energy_market_mg_per_kg":810000,"metered_kwh":150000,"retired_kwh":120000,"unmatched_kwh":30000}'::jsonb,
  '{"conversion_factor":"CF-PILOT-1","carbon_method":{"id":"CM-PA6","version":2},"allocation_basis":"mass"}'::jsonb,
  '2026-02-28T10:00:00Z')
ON CONFLICT DO NOTHING;

INSERT INTO specifications (grade,version,issued_on,virgin_reference,rows,state) VALUES
 ('N6',3,'2026-02-01','{"reference":"virgin PA6 at relative viscosity 2.42","source":"EcoBase 2025","dated":"2025-11-30"}'::jsonb,
  '[{"property":"relative_viscosity","method":"ISO 307","limit":"2.40","unit":"ratio","basis":"guaranteed"},{"property":"moisture","method":"ISO 15512","limit":"0.10","unit":"percent","basis":"guaranteed"},{"property":"yellowness_index","method":"ASTM E313","limit":"8.0","unit":"index","basis":"typical"},{"property":"ash_content","method":"ISO 3451-1","limit":"0.30","unit":"percent","basis":"informational"}]'::jsonb,'current'),
 ('N6',2,'2025-09-15','{"reference":"virgin PA6 at relative viscosity 2.40","source":"EcoBase 2024","dated":"2024-11-30"}'::jsonb,
  '[{"property":"relative_viscosity","method":"ISO 307","limit":"2.38","unit":"ratio","basis":"guaranteed"},{"property":"moisture","method":"ISO 15512","limit":"0.12","unit":"percent","basis":"guaranteed"},{"property":"yellowness_index","method":"ASTM E313","limit":"9.0","unit":"index","basis":"typical"},{"property":"ash_content","method":"ISO 3451-1","limit":"0.40","unit":"percent","basis":"informational"}]'::jsonb,'superseded')
ON CONFLICT DO NOTHING;

INSERT INTO customers (reference,party,contact,application,industry) VALUES
 ('CUS-HELIOS','CUS-HELIOS','helios@example.com','technical apparel yarn','textiles'),
 ('CUS-VANTA','CUS-VANTA','vanta@example.com','airbag fabric','automotive')
ON CONFLICT DO NOTHING;

INSERT INTO specification_issues (customer,grade,version,issued_on) VALUES
 ('CUS-HELIOS','N6',3,'2026-02-01'),('CUS-VANTA','N6',2,'2025-09-15')
ON CONFLICT DO NOTHING;

INSERT INTO conformances (reference,customer,application,grade,spec_version,trials,outcome) VALUES
 ('CONF-0001','CUS-HELIOS','technical apparel yarn','N6',3,'[{"trial":"spinning trial at 120 dtex","on":"2026-02-20","outcome":"passed"}]'::jsonb,'passed'),
 ('CONF-0002','CUS-VANTA','airbag fabric','N6',2,'[{"trial":"weave trial at 470 dtex","on":"2025-10-12","outcome":"passed"}]'::jsonb,'passed')
ON CONFLICT DO NOTHING;

INSERT INTO contracts (id,customer,site,period,committed_kg,floor_bp,delivered_kg,shortfall_consequence,unreachable_since) VALUES
 ('CON-HELIOS-1','CUS-HELIOS','SITE-DEMO','2026-H1',200,5000,0,'a price adjustment at the following quarter review',NULL),
 ('CON-VANTA-1','CUS-VANTA','SITE-COMM','2029-H1',1000,3000,0,'a make-good volume in the following period',NULL)
ON CONFLICT DO NOTHING;

INSERT INTO certificate_sequences (site,next_number) VALUES
 ('SITE-PILOT',3),('SITE-DEMO',1)
ON CONFLICT DO NOTHING;

INSERT INTO certificates (number,version,site,grade,period,claim_type,content_bp,category_split,lots,specification_version,recipient,carbon_figure,scheme,registration,test_results,permitted_statement,prohibited_statement,provisional_factor,conditions,derived_from,signer,signed_at,state,withdrawn_by,withdrawn_on,withdrawal_reason,notified_recipients,void_statements,derived_certificates,batch_traversal) VALUES
 ('CERT-PILOT-000001',1,'SITE-PILOT','N6','BP-PILOT-N6-2026H1','mass_balance',7500,'{"post_consumer":100}'::jsonb,
  '[{"reference":"LOT-N6-0003","mass_g":200000}]'::jsonb,3,'CUS-HELIOS','CFG-PILOT-0001','RCS-2026','REG-RAVEL-0042',
  '[{"reference":"TR-PILOT-0001","property":"relative_viscosity","method":"ISO 307","value":"2.43","unit":"ratio"}]'::jsonb,
  'Materials containing product manufactured with recycled content may be described as containing 75% recycled nylon 6 by mass balance.',
  'You may not state that this material physically contains recycled content.',
  true,
  '[{"condition":"lot_released","satisfied":true},{"condition":"no_open_deviation","satisfied":true},{"condition":"no_unreviewed_override","satisfied":true},{"condition":"period_closed","satisfied":true},{"condition":"balance_invariant_holds","satisfied":true},{"condition":"carbon_figure_complete","satisfied":true},{"condition":"signer_scope","satisfied":true},{"condition":"signer_not_data_enterer","satisfied":true}]'::jsonb,
  '{"conversion_factor":"CF-PILOT-1","carbon_method":{"id":"CM-PA6","version":2},"specification":{"grade":"N6","version":3}}'::jsonb,
  'signer2@example.com','2026-03-02T10:00:00Z','withdrawn','signer2@example.com','2026-04-18','A collector category was corrected after acceptance',
  '["CUS-HELIOS"]'::jsonb,
  '["Materials containing product manufactured with recycled content may be described as containing 75% recycled nylon 6 by mass balance.","You may not state that this material physically contains recycled content."]'::jsonb,
  '[]'::jsonb,
  '{"batches":[],"lots":["LOT-N6-0003"],"certificates":["CERT-PILOT-000002"],"recipients":["CUS-VANTA"]}'::jsonb),
 ('CERT-PILOT-000002',1,'SITE-PILOT','N6','BP-PILOT-N6-2026H1','mass_balance',7500,'{"post_consumer":100}'::jsonb,
  '[{"reference":"LOT-N6-0003","mass_g":200000}]'::jsonb,3,'CUS-VANTA','CFG-PILOT-0001','RCS-2026','REG-RAVEL-0042',
  '[{"reference":"TR-PILOT-0001","property":"relative_viscosity","method":"ISO 307","value":"2.43","unit":"ratio"}]'::jsonb,
  'Materials containing product manufactured with recycled content may be described as containing 75% recycled nylon 6 by mass balance.',
  'You may not state that this material physically contains recycled content.',
  true,
  '[{"condition":"lot_released","satisfied":true},{"condition":"no_open_deviation","satisfied":true},{"condition":"no_unreviewed_override","satisfied":true},{"condition":"period_closed","satisfied":true},{"condition":"balance_invariant_holds","satisfied":true},{"condition":"carbon_figure_complete","satisfied":true},{"condition":"signer_scope","satisfied":true},{"condition":"signer_not_data_enterer","satisfied":true}]'::jsonb,
  '{"conversion_factor":"CF-PILOT-1","carbon_method":{"id":"CM-PA6","version":2},"specification":{"grade":"N6","version":3}}'::jsonb,
  'signer2@example.com','2026-03-02T11:00:00Z','issued',NULL,NULL,NULL,NULL,NULL,NULL,NULL)
ON CONFLICT DO NOTHING;

INSERT INTO restatements (reference,period,reason,opened_by,opened_on,certificates,content_movements,conversion_factor,state) VALUES
 ('RST-0001','BP-PILOT-N6-2026H1','Suspension of the site certification for SITE-PILOT recorded retrospectively.','claims@example.com','2026-04-20',
  '["CERT-PILOT-000001","CERT-PILOT-000002"]'::jsonb,
  '[]'::jsonb,NULL,'open')
ON CONFLICT DO NOTHING;

INSERT INTO resolutions (restatement,certificate,outcome,reason,resolved_by) VALUES
 ('RST-0001','CERT-PILOT-000001','withdrawn','The certificate was already withdrawn for its own reason; recorded as unaffected by this restatement.','claims@example.com')
ON CONFLICT DO NOTHING;

INSERT INTO site_certifications (site,state,valid_from,valid_to,recorded_by,note) VALUES
 ('SITE-PILOT','certified','2025-06-01','2027-06-01','quality@example.com','Initial certification'),
 ('SITE-DEMO','certified','2025-06-01','2027-06-01','quality@example.com','Initial certification')
ON CONFLICT DO NOTHING;

INSERT INTO site_events (site,effective_from,effective_to,kind,detail) VALUES
 ('SITE-PILOT','2026-04-01','2026-05-31','certification_suspended','{"reason":"Documentation gap in the collector approval file"}'::jsonb)
ON CONFLICT DO NOTHING;

INSERT INTO inbound_records (reference,source,received_at,payload_verbatim,payload) VALUES
 ('INB-0001','weighbridge','2026-02-20T06:14:00Z','{"ticket":"WB-2206","device":"WB-DEMO-02","gross_g":120500,"tare_g":500,"calibration_state":"lapsed","batch":"BATCH-1004"}','{"ticket":"WB-2206","device":"WB-DEMO-02","gross_g":120500,"tare_g":500,"calibration_state":"lapsed","batch":"BATCH-1004"}'::jsonb),
 ('INB-0002','control_system','2026-03-04T22:41:00Z','{"run":"RUN-D-0001","setpoints":{"temperature":165,"pressure":3,"residence_minutes":95}}','{"run":"RUN-D-0001","setpoints":{"temperature":165,"pressure":3,"residence_minutes":95}}'::jsonb),
 ('INB-0003','laboratory','2026-03-06T09:02:00Z','{"lot":"LOT-N6-0001","property":"relative_viscosity","method":"ISO 307","value":"2.45","unit":"ratio","analyst":"analyst@example.com"}','{"lot":"LOT-N6-0001","property":"relative_viscosity","method":"ISO 307","value":"2.45","unit":"ratio","analyst":"analyst@example.com"}'::jsonb)
ON CONFLICT DO NOTHING;

INSERT INTO statistics (key,value,source,year,geography) VALUES
 ('textiles_recycled','Less than 1 per cent of textiles are recycled into new materials','Textile Flow Monitor',2024,'Global'),
 ('plastics_emissions','1.8 gigatonnes of carbon dioxide equivalent a year from plastics production','Global Materials Emissions Panel',2023,'Global'),
 ('textile_incineration','More than 8 per cent of textile waste is incinerated each year','Textile Flow Monitor',2024,'EU-27')
ON CONFLICT DO NOTHING;

INSERT INTO positions (title,location,department,contract_type,closes_on) VALUES
 ('Process Engineer','Lyon, France','Operations','Permanent','2026-11-30')
ON CONFLICT DO NOTHING;

INSERT INTO news_items (title,tag,outlet,published_on,link,language) VALUES
 ('Series A closes at 40 million euros','funding','Materials Weekly','2026-01-22','https://materials-weekly.example.com/ravel-series-a','en'),
 ('Offtake agreement signed for demonstration output','partnership','Fibre Report','2026-03-11','https://fibre-report.example.com/ravel-offtake','en'),
 ('Depolymerisation yield published','technical','Chimie Circulaire','2026-05-06','https://chimie-circulaire.example.com/ravel-rendement','fr')
ON CONFLICT DO NOTHING;

INSERT INTO claim_substantiations (key,claim,route,first_published_on,evidence,method_version,approver,review_on) VALUES
 ('less_than_one_percent','Less than 1 per cent of textiles are recycled into new materials','/about','2026-01-05','[{"statistic":"textiles_recycled"}]'::jsonb,'CM-PA6 v2','quality@example.com','2027-01-05'),
 ('low_carbon','Low-carbon recycled polymers','/','2026-01-05','[{"certificate":"CERT-PILOT-000002"},{"carbon_figure":"CFG-0001"}]'::jsonb,'CM-PA6 v2','quality@example.com','2027-01-05'),
 ('virgin_quality','Virgin-quality recycled Nylon 6','/product','2026-01-05','[{"specification":"SPEC-N6 v3"},{"virgin_reference":"virgin PA6 at relative viscosity 2.42"}]'::jsonb,'CM-PA6 v2','quality@example.com','2027-01-05')
ON CONFLICT DO NOTHING;
