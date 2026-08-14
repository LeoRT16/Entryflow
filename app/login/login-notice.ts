type SearchParamsLike = Record<string, string | string[] | undefined>;

function getSingleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function getLoginNoticeMessage(searchParams: SearchParamsLike) {
  const error = (getSingleValue(searchParams.error) ?? "").trim().toLowerCase();
  const errorCode = (getSingleValue(searchParams.error_code) ?? "").trim().toLowerCase();
  const description = (getSingleValue(searchParams.error_description) ?? "").trim().toLowerCase();

  const isExpiredInvite =
    errorCode === "otp_expired"
    || (error === "access_denied" && (description.includes("expired") || description.includes("invalid")));

  if (isExpiredInvite) {
    return "Esta invitación expiró o ya fue utilizada. Solicita una nueva invitación.";
  }

  return null;
}
