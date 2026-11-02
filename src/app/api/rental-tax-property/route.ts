import { lookupAccessDenied } from "@/lib/cloud/api-access";
import { NextRequest, NextResponse } from 'next/server';
import { lookupRentalSnapshot } from '@/lib/taxes/rental-snapshot';
export async function GET(request: NextRequest) {
  const denied = await lookupAccessDenied(); if (denied) return denied;
  const address = request.nextUrl.searchParams.get('address')?.trim() ?? '';
  const parcelId = request.nextUrl.searchParams.get('parcelId')?.trim() ?? '';
  if (address.length > 240 || parcelId.length > 40) return NextResponse.json({status:'missing',message:'The property query is too long.'},{status:400});
  return NextResponse.json(lookupRentalSnapshot({address,parcelId}),{headers:{'Cache-Control':'no-store'}});
}
