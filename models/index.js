// /models/index.js
const User = require('./user');
const ApiKey = require('./api_key');
const NotificationPreference = require('./notification_preference');
const CustomerCompany = require('./customer_company');
const ProspectCompany = require('./prospect_company');
const CompanyDomain = require('./company_domain');
const Contact = require('./contact');
const ContactIdentity = require('./contact_identity');
const AnonymousVisitor = require('./anonymous_visitor');
const IntentSignal = require('./intent_signal');
const LeadRequest = require('./lead_request');
const DailyAccountIntent = require('./daily_account_intent');
const AccountAiSummary = require('./account_ai_summary');
const AbmScoreConfig = require('./abm_score_config');
const AbmScoreWeight = require('./abm_score_weight');
const AbmEventRule = require('./abm_event_rule');
const AbmPromptTemplate = require('./abm_prompt_template');
const AbmAdminAuditLog = require('./abm_admin_audit_log');
const AbmOperatorAction = require('./abm_operator_action');
const Mission = require('./mission');
const MissionContact = require('./mission_contact');
const MissionArtifact = require('./mission_artifact');
const MissionActivity = require('./mission_activity');
const MissionTask = require('./mission_task');
const AbmMissionTemplate = require('./abm_mission_template');
const ProcurementProgram = require('./procurement_program');
const ProgramAccountLink = require('./program_account_link');
const ProgramMissionLink = require('./program_mission_link');
const ProcurementImportRun = require('./procurement_import_run');
const AbmTopicRule = require('./abm_topic_rule');
const AbmSourceWeight = require('./abm_source_weight');
const AbmProgramRule = require('./abm_program_rule');
const AbmProgramSuppressionRule = require('./abm_program_suppression_rule');
const AbmLaneDefinition = require('./abm_lane_definition');
const AbmAgencyBlacklist = require('./abm_agency_blacklist');
const ProcurementProgramNote = require('./procurement_program_note');
const ProgramItem = require('./program_item');
const ProgramItemNote = require('./program_item_note');
const ProgramItemAccountLink = require('./program_item_account_link');
const ProgramItemMissionLink = require('./program_item_mission_link');

// -------------------------------------
//  DEFINE MODEL RELATIONSHIPS
// -------------------------------------  

// User relationships
User.hasOne(NotificationPreference, {
  foreignKey: 'user_id',
  as: 'notificationPreference',
  onDelete: 'CASCADE',
});
NotificationPreference.belongsTo(User, {
  foreignKey: 'user_id',
});

// User -> CustomerCompany (many-to-one)
User.belongsTo(CustomerCompany, {
  foreignKey: 'customer_company_id',
  as: 'customerCompany',
});
CustomerCompany.hasMany(User, {
  foreignKey: 'customer_company_id',
  as: 'users',
});

// ProspectCompany relationships
ProspectCompany.belongsTo(User, {
  foreignKey: 'owner_user_id',
  as: 'owner',
});
User.hasMany(ProspectCompany, {
  foreignKey: 'owner_user_id',
  as: 'ownedProspects',
});

ProspectCompany.belongsTo(CustomerCompany, {
  foreignKey: 'customer_company_id',
  as: 'customerCompany',
});
CustomerCompany.hasMany(ProspectCompany, {
  foreignKey: 'customer_company_id',
  as: 'prospects',
});

// CompanyDomain relationships
CompanyDomain.belongsTo(ProspectCompany, {
  foreignKey: 'prospect_company_id',
  as: 'prospectCompany',
});
ProspectCompany.hasMany(CompanyDomain, {
  foreignKey: 'prospect_company_id',
  as: 'domains',
});

// Contact relationships
Contact.belongsTo(ProspectCompany, {
  foreignKey: 'prospect_company_id',
  as: 'prospectCompany',
});
ProspectCompany.hasMany(Contact, {
  foreignKey: 'prospect_company_id',
  as: 'contacts',
});

// ContactIdentity relationships
ContactIdentity.belongsTo(Contact, {
  foreignKey: 'contact_id',
  as: 'contact',
});
Contact.hasMany(ContactIdentity, {
  foreignKey: 'contact_id',
  as: 'identities',
});

// AnonymousVisitor relationships
AnonymousVisitor.belongsTo(ProspectCompany, {
  foreignKey: 'prospect_company_id',
  as: 'prospectCompany',
});
ProspectCompany.hasMany(AnonymousVisitor, {
  foreignKey: 'prospect_company_id',
  as: 'anonymousVisitors',
});

// IntentSignal relationships
IntentSignal.belongsTo(ProspectCompany, {
  foreignKey: 'prospect_company_id',
  as: 'prospectCompany',
});
ProspectCompany.hasMany(IntentSignal, {
  foreignKey: 'prospect_company_id',
  as: 'intentSignals',
});

// DailyAccountIntent relationships
DailyAccountIntent.belongsTo(ProspectCompany, {
  foreignKey: 'prospect_company_id',
  as: 'prospectCompany',
});
ProspectCompany.hasMany(DailyAccountIntent, {
  foreignKey: 'prospect_company_id',
  as: 'dailyAccountIntents',
});

// AccountAiSummary relationships
AccountAiSummary.belongsTo(ProspectCompany, {
  foreignKey: 'prospect_company_id',
  as: 'prospectCompany',
});
ProspectCompany.hasMany(AccountAiSummary, {
  foreignKey: 'prospect_company_id',
  as: 'accountAiSummaries',
});

// Registry: AbmScoreConfig + AbmScoreWeight
AbmScoreConfig.hasMany(AbmScoreWeight, {
  foreignKey: 'score_config_id',
  as: 'weights',
});
AbmScoreWeight.belongsTo(AbmScoreConfig, {
  foreignKey: 'score_config_id',
  as: 'scoreConfig',
});

// LeadRequest relationships
LeadRequest.belongsTo(ProspectCompany, {
  foreignKey: 'prospect_company_id',
  as: 'prospectCompany',
});
ProspectCompany.hasMany(LeadRequest, {
  foreignKey: 'prospect_company_id',
  as: 'leadRequests',
});

LeadRequest.belongsTo(Contact, {
  foreignKey: 'contact_id',
  as: 'contact',
});
Contact.hasMany(LeadRequest, {
  foreignKey: 'contact_id',
  as: 'leadRequests',
});

LeadRequest.belongsTo(User, {
  foreignKey: 'routed_to_user_id',
  as: 'routedTo',
});
User.hasMany(LeadRequest, {
  foreignKey: 'routed_to_user_id',
  as: 'routedLeadRequests',
});

AbmOperatorAction.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
User.hasMany(AbmOperatorAction, { foreignKey: 'user_id', as: 'operatorActions' });
AbmOperatorAction.belongsTo(ProspectCompany, { foreignKey: 'prospect_company_id', as: 'prospectCompany' });
ProspectCompany.hasMany(AbmOperatorAction, { foreignKey: 'prospect_company_id', as: 'operatorActions' });
AbmOperatorAction.belongsTo(LeadRequest, { foreignKey: 'lead_request_id', as: 'leadRequest' });
LeadRequest.hasMany(AbmOperatorAction, { foreignKey: 'lead_request_id', as: 'operatorActions' });

// Mission relationships
Mission.belongsTo(ProspectCompany, { foreignKey: 'prospect_company_id', as: 'prospectCompany' });
ProspectCompany.hasMany(Mission, { foreignKey: 'prospect_company_id', as: 'missions' });
Mission.belongsTo(Contact, { foreignKey: 'primary_contact_id', as: 'primaryContact' });
Contact.hasMany(Mission, { foreignKey: 'primary_contact_id', as: 'primaryMissions' });
Mission.belongsTo(LeadRequest, { foreignKey: 'lead_request_id', as: 'leadRequest' });
LeadRequest.belongsTo(Mission, { foreignKey: 'mission_id', as: 'mission' });
Mission.hasOne(LeadRequest, { foreignKey: 'mission_id', as: 'linkedLeadRequest' });
Mission.belongsTo(User, { foreignKey: 'owner_user_id', as: 'owner' });
User.hasMany(Mission, { foreignKey: 'owner_user_id', as: 'ownedMissions' });
Mission.hasMany(MissionArtifact, { foreignKey: 'mission_id', as: 'artifacts' });
MissionArtifact.belongsTo(Mission, { foreignKey: 'mission_id', as: 'mission' });
Mission.hasMany(MissionActivity, { foreignKey: 'mission_id', as: 'activities' });
MissionActivity.belongsTo(Mission, { foreignKey: 'mission_id', as: 'mission' });
Mission.hasMany(MissionTask, { foreignKey: 'mission_id', as: 'tasks' });
MissionTask.belongsTo(Mission, { foreignKey: 'mission_id', as: 'mission' });
MissionTask.belongsTo(User, { foreignKey: 'owner_user_id', as: 'owner' });
User.hasMany(MissionTask, { foreignKey: 'owner_user_id', as: 'missionTasks' });
Mission.belongsToMany(Contact, { through: MissionContact, foreignKey: 'mission_id', otherKey: 'contact_id', as: 'contacts' });
Contact.belongsToMany(Mission, { through: MissionContact, foreignKey: 'contact_id', otherKey: 'mission_id', as: 'missions' });
MissionContact.belongsTo(Mission, { foreignKey: 'mission_id', as: 'mission' });
MissionContact.belongsTo(Contact, { foreignKey: 'contact_id', as: 'contact' });
MissionArtifact.belongsTo(User, { foreignKey: 'created_by_user_id', as: 'createdBy' });
MissionActivity.belongsTo(User, { foreignKey: 'created_by_user_id', as: 'createdBy' });
IntentSignal.belongsTo(Mission, { foreignKey: 'mission_id', as: 'mission' });
Mission.hasMany(IntentSignal, { foreignKey: 'mission_id', as: 'intentSignals' });

// Procurement Radar (ABM Rev 3)
ProcurementProgram.hasMany(ProgramAccountLink, { foreignKey: 'procurement_program_id', as: 'accountLinks' });
ProgramAccountLink.belongsTo(ProcurementProgram, { foreignKey: 'procurement_program_id', as: 'procurementProgram' });
ProgramAccountLink.belongsTo(ProspectCompany, { foreignKey: 'prospect_company_id', as: 'prospectCompany' });
ProspectCompany.hasMany(ProgramAccountLink, { foreignKey: 'prospect_company_id', as: 'programAccountLinks' });
ProgramAccountLink.belongsTo(User, { foreignKey: 'created_by_user_id', as: 'createdBy' });

ProcurementProgram.hasMany(ProgramMissionLink, { foreignKey: 'procurement_program_id', as: 'missionLinks' });
ProgramMissionLink.belongsTo(ProcurementProgram, { foreignKey: 'procurement_program_id', as: 'procurementProgram' });
ProgramMissionLink.belongsTo(Mission, { foreignKey: 'mission_id', as: 'mission' });
Mission.hasMany(ProgramMissionLink, { foreignKey: 'mission_id', as: 'programLinks' });
ProgramMissionLink.belongsTo(User, { foreignKey: 'created_by_user_id', as: 'createdBy' });

ProcurementProgram.belongsToMany(ProspectCompany, {
  through: ProgramAccountLink,
  foreignKey: 'procurement_program_id',
  otherKey: 'prospect_company_id',
  as: 'linkedAccounts',
});
ProspectCompany.belongsToMany(ProcurementProgram, {
  through: ProgramAccountLink,
  foreignKey: 'prospect_company_id',
  otherKey: 'procurement_program_id',
  as: 'linkedPrograms',
});

ProcurementProgram.belongsToMany(Mission, {
  through: ProgramMissionLink,
  foreignKey: 'procurement_program_id',
  otherKey: 'mission_id',
  as: 'linkedMissions',
});
Mission.belongsToMany(ProcurementProgram, {
  through: ProgramMissionLink,
  foreignKey: 'mission_id',
  otherKey: 'procurement_program_id',
  as: 'linkedPrograms',
});

ProcurementProgram.hasMany(ProcurementProgramNote, { foreignKey: 'procurement_program_id', as: 'notes' });
ProcurementProgramNote.belongsTo(ProcurementProgram, { foreignKey: 'procurement_program_id', as: 'procurementProgram' });
ProcurementProgramNote.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
User.hasMany(ProcurementProgramNote, { foreignKey: 'user_id', as: 'programNotes' });
ProcurementProgram.belongsTo(User, { foreignKey: 'owner_user_id', as: 'owner' });
User.hasMany(ProcurementProgram, { foreignKey: 'owner_user_id', as: 'ownedPrograms' });

// Program Items (Sprint 2: unified SAM + USAspending + SpaceWERX)
ProgramItem.hasMany(ProgramItemNote, { foreignKey: 'program_item_id', as: 'notes' });
ProgramItemNote.belongsTo(ProgramItem, { foreignKey: 'program_item_id', as: 'programItem' });
ProgramItemNote.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
User.hasMany(ProgramItemNote, { foreignKey: 'user_id', as: 'programItemNotes' });
ProgramItem.hasMany(ProgramItemAccountLink, { foreignKey: 'program_item_id', as: 'accountLinks' });
ProgramItemAccountLink.belongsTo(ProgramItem, { foreignKey: 'program_item_id', as: 'programItem' });
ProgramItemAccountLink.belongsTo(ProspectCompany, { foreignKey: 'prospect_company_id', as: 'prospectCompany' });
ProspectCompany.hasMany(ProgramItemAccountLink, { foreignKey: 'prospect_company_id', as: 'programItemAccountLinks' });
ProgramItemAccountLink.belongsTo(User, { foreignKey: 'created_by_user_id', as: 'createdBy' });
ProgramItem.hasMany(ProgramItemMissionLink, { foreignKey: 'program_item_id', as: 'missionLinks' });
ProgramItemMissionLink.belongsTo(ProgramItem, { foreignKey: 'program_item_id', as: 'programItem' });
ProgramItemMissionLink.belongsTo(Mission, { foreignKey: 'mission_id', as: 'mission' });
Mission.hasMany(ProgramItemMissionLink, { foreignKey: 'mission_id', as: 'programItemLinks' });
ProgramItemMissionLink.belongsTo(User, { foreignKey: 'created_by_user_id', as: 'createdBy' });
ProgramItem.belongsTo(User, { foreignKey: 'owner_user_id', as: 'owner' });
User.hasMany(ProgramItem, { foreignKey: 'owner_user_id', as: 'ownedProgramItems' });

module.exports = {
  User,
  ApiKey,
  NotificationPreference,
  CustomerCompany,
  ProspectCompany,
  CompanyDomain,
  Contact,
  ContactIdentity,
  AnonymousVisitor,
  IntentSignal,
  DailyAccountIntent,
  AccountAiSummary,
  AbmScoreConfig,
  AbmScoreWeight,
  AbmEventRule,
  AbmPromptTemplate,
  AbmAdminAuditLog,
  AbmOperatorAction,
  LeadRequest,
  Mission,
  MissionContact,
  MissionArtifact,
  MissionActivity,
  MissionTask,
  AbmMissionTemplate,
  ProcurementProgram,
  ProgramAccountLink,
  ProgramMissionLink,
  ProcurementImportRun,
  AbmTopicRule,
  AbmSourceWeight,
  AbmProgramRule,
  AbmProgramSuppressionRule,
  AbmLaneDefinition,
  AbmAgencyBlacklist,
  ProcurementProgramNote,
  ProgramItem,
  ProgramItemNote,
  ProgramItemAccountLink,
  ProgramItemMissionLink,
};
