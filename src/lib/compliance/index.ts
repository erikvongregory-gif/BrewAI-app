export {
  ALCOHOL_AD_RULES,
  COMPLIANCE_CATEGORY_LABELS,
  termPattern,
  type AlcoholAdRule,
  type ComplianceCategory,
  type ComplianceContentKind,
  type ComplianceSeverity,
} from "./alcoholAdRules";
export {
  COMPLIANCE_DISCLAIMER,
  checkAdCompliance,
  checkAdComplianceMany,
  compareSeverity,
  resolveBeverage,
  type BeverageContext,
  type ComplianceCheckInput,
  type ComplianceFinding,
  type ComplianceMatch,
  type ComplianceReport,
} from "./checkAdCompliance";
export { COMPLIANCE_SOURCES, getComplianceSources, type ComplianceSource, type ComplianceSourceId } from "./sources";
