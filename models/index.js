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
   LeadRequest,
};
