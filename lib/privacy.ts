// 개인정보 경고: 보내기 전에 전화번호·이메일을 찾아서 가릴 수 있게 한다 (AI로 보내지 않기 위해)

const PHONE = /(?<!\d)(01[016789]|0[2-6][0-9]?|070)[-.\s]?(\d{3,4})[-.\s]?(\d{4})(?!\d)/g;
const EMAIL = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;

export function findPrivate(text: string) {
  return {
    phones: text.match(PHONE)?.length ?? 0,
    emails: text.match(EMAIL)?.length ?? 0,
  };
}

// 010-1234-5678 → 010-****-****, minji@school.ac.kr → m***@school.ac.kr
export function maskPrivate(text: string) {
  return text.replace(PHONE, "$1-****-****").replace(EMAIL, "$1***@$2");
}
