export const OWNED_FIELDS = [
  ['property','address','Address','text'],['property','city','City','text'],['property','state','State','text'],['property','zip','ZIP','text'],['property','status','Occupancy status','status'],
  ['property','beds','Bedrooms','number'],['property','baths','Bathrooms','number'],['property','square_feet','Above-grade sq ft','number'],['property','year_built','Year built','number'],['property','garage','Garage','text'],['property','lot_square_feet','Lot sq ft','number'],['property','property_type','Property type','text'],
  ['finance','acquisition_date','Purchase date','date'],['finance','purchase_price','Actual purchase price','number'],['finance','acquisition_closing_costs','Purchase closing costs','number'],['finance','initial_financing','Initial acquisition financing','number'],['finance','acquisition_cash_invested','Acquisition cash invested','number'],['finance','original_rehab_budget','Original rehab budget','number'],['finance','actual_rehab_cost','Actual rehab cost','number'],['finance','rehab_start_date','Rehab start','date'],['finance','rehab_completion_date','Rehab completed','date'],['finance','total_cash_invested','Total cash contributed','number'],['finance','cash_left_in_deal','Cash remaining after refinance','signed'],['finance','realized_cash_flow','Realized cash flow to date','signed'],['finance','realized_sale_proceeds','Realized sale proceeds','number'],
  ['operations','target_monthly_rent','Target monthly rent (not a lease)','number'],['operations','management_percent','Management %','rate'],['operations','vacancy_percent','Vacancy reserve %','rate'],['operations','maintenance_percent','Maintenance reserve %','rate'],['operations','annual_taxes','Annual property taxes','number'],['operations','annual_insurance','Annual insurance (home + flood)','number'],['operations','monthly_other_expenses','Other costs / month, including CapEx','number'],
  ['loan','lender','Lender','text'],['loan','original_amount','Original loan amount','number'],['loan','balance','Recorded loan balance','number'],['loan','balance_as_of','Loan balance as of','date'],['loan','interest_rate','Interest rate %','rate'],['loan','term_years','Term years','number'],['loan','monthly_principal_and_interest','Monthly principal & interest','number'],['loan','annual_taxes','Loan annual taxes','number'],['loan','annual_insurance','Loan annual insurance','number'],['loan','prepayment_penalty','Prepayment penalty','text'],['loan','refinance_date','Refinance disbursement date','date'],['loan','refinance_amount','Refinance loan amount','number'],['loan','refinance_costs','Total refinance closing costs','number'],
  ['valuation','original_arv','Original ARV estimate','number'],['valuation','appraised_value','Appraised value','number'],['valuation','current_estimated_value','Recorded property value','number'],['valuation','as_of_date','Valuation as of','date'],
  ['lease','monthly_rent','Signed lease monthly rent','number'],['lease','start_date','Lease start','date'],['lease','end_date','Lease end','date'],
] as const;
export type OwnedRows=Record<string,Record<string,string|number|null>>;
export function validateOwnedValues(value:unknown):OwnedRows {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid property records.');
  const v=value as Record<string,unknown>,rows:OwnedRows={property:{},finance:{},operations:{},loan:{},valuation:{},lease:{}};
  for(const [group,key,label,type] of OWNED_FIELDS){
    const raw=v[`${group}.${key}`];let result:string|number|null=null;
    if(raw!=null&&raw!==''){
      if(type==='text'||type==='status'||type==='date'){
        if(typeof raw!=='string'||raw.length>500)throw new Error(`Invalid ${label}.`);
        result=raw.trim()||null;
        if(type==='date'&&result&&(!/^\d{4}-\d{2}-\d{2}$/.test(result)||!Number.isFinite(Date.parse(result))||new Date(result).toISOString().slice(0,10)!==result))throw new Error(`Invalid ${label}.`);
        if(type==='status'&&!['Owned','Rented','Rehab','Vacant'].includes(String(result)))throw new Error('Invalid occupancy status.');
      }else{
        if(typeof raw!=='number'||!Number.isFinite(raw)||Math.abs(raw)>1e9||(type!=='signed'&&raw<0)||(type==='rate'&&raw>100))throw new Error(`Invalid ${label}.`);
        result=raw;
        if(['square_feet','lot_square_feet','year_built'].includes(key)&&!Number.isInteger(raw))throw new Error(`${label} must be a whole number.`);
      }
    }
    rows[group][key]=result;
  }
  for(const key of ['address','city','state','zip','status'])if(!rows.property[key])throw new Error(`Enter ${key}.`);
  if(Number(rows.operations.management_percent)+Number(rows.operations.vacancy_percent)+Number(rows.operations.maintenance_percent)>100)throw new Error('Operating percentage costs cannot exceed 100%.');
  const refi=['refinance_date','refinance_amount','refinance_costs'].map(k=>rows.loan[k]!=null);if(refi.some(Boolean)&&!refi.every(Boolean))throw new Error('Enter refinance date, amount and costs together.');
  if(Object.values(rows.loan).some(v=>v!=null)&&!rows.loan.lender)throw new Error('Enter a lender for the loan.');
  if((rows.lease.start_date||rows.lease.end_date)&&rows.lease.monthly_rent==null)throw new Error('Enter signed lease rent before saving lease dates.');
  if(rows.lease.start_date&&rows.lease.end_date&&String(rows.lease.end_date)<String(rows.lease.start_date))throw new Error('Lease end must follow lease start.');
  return rows;
}
