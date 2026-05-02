# Airport Warning Parsing Implementation

Status: Current implementation spec as of 2026-05-02.

이 문서는 `backend/src/parsers/warning-parser.js` 기준의 공항경보 파싱 로직을 재구현 가능한 수준으로 설명합니다.

## 사이트에서 하는 일

공항경보 파싱 결과는 `/ops` 상단 경보 목록, 모바일 현재날씨 탭의 경보 영역, 알림 엔진의 경보 발령/해제 판정에 사용된다. 사용자는 선택 공항에 현재 어떤 경보가 발효 중인지, 유효 시간이 언제까지인지, 어떤 종류의 경보인지 확인한다.

KMA 경보 API는 경보 코드와 시간 필드가 여러 이름으로 들어올 수 있으므로, 파서는 이를 표준 warning 객체로 정규화한다. 특히 윈드시어 중복 경보를 제거하고, 경보 타입 코드를 `shared/warning-types`의 표시명과 내부 key로 연결하는 것이 중요하다.

## Purpose

KMA 공항경보 XML items를 공항별 warning 배열로 정규화한다.

Parser contract:

- Input: KMA response XML string.
- Output: warning result object.
- Empty or unrecognized items are skipped, but parser still returns an object.
- Module export: `{ parse }`.

## XML Parser Setup

`fast-xml-parser` options:

- `ignoreAttributes: false`
- `attributeNamePrefix: "@_"`
- `removeNSPrefix: false`
- array field: `item`

Item lookup order:

1. `response.body.items.item`
2. `body.items.item`
3. `items.item`

## Output Shape

```js
{
  type: "AIRPORT_WARNINGS",
  fetched_at,
  total_count,
  airports: {
    [icao]: {
      airport_name,
      warnings: [
        {
          issued,
          wrng_type,
          wrng_type_key,
          wrng_type_name,
          valid_start,
          valid_end,
          raw_message
        }
      ]
    }
  }
}
```

`fetched_at` is generated with `new Date().toISOString()`.

## Warning Type Resolution

Type mapping comes from `shared/warning-types`.

Input field:

- `item.wrngType`
- fallback `item.warningType`
- fallback empty string

Candidate sequence:

1. Raw trimmed type string.
2. If raw is `"0"`, also try `"00"`.
3. If raw has leading zeroes, try the stripped version.

The first key found in `warningTypes` wins.

Fallback:

```js
{
  key: "UNKNOWN",
  name: "Unknown Warning"
}
```

## Field Mapping

ICAO lookup:

- `item.icaoCode`
- `item.icao`
- `item.airportIcao`

Items without ICAO are skipped.

Airport name:

- `item.airportName`
- fallback ICAO

Issued time:

- `item.tm`
- `item.wrngIssueTime`
- `item.issued`

Valid start:

- `item.validTm1`
- `item.validStart`
- `item.wrngFrom`

Valid end:

- `item.validTm2`
- `item.validEnd`
- `item.wrngTo`

All warning times use `parseYmdhmToIso()`:

- accepts `YYYYMMDDHHmm`
- returns UTC ISO string
- returns `null` on invalid or missing values

Raw message:

- `item.wrngMsg`
- `item.warningMessage`
- fallback `null`
- XML entities are decoded after extraction.

## XML Entity Decoding

The parser decodes:

- `&#xD;` -> newline
- `&lt;` -> `<`
- `&gt;` -> `>`
- `&quot;` -> `"`
- `&#39;` -> `'`
- `&amp;` -> `&`

## Duplicate Handling

Only `WIND_SHEAR` gets duplicate suppression.

A wind shear warning is considered duplicate when an existing warning for the same airport has:

- `wrng_type_key === "WIND_SHEAR"`
- same `valid_start`
- same `valid_end`

Duplicate wind shear entries are skipped and do not increment `total_count`.

Other warning types are not deduplicated by the parser.

## Sorting

After all items are processed, each airport warning list is sorted ascending by `issued` string.

Null issued values sort as empty strings.

## Reimplementation Pseudocode

```js
function parseWarningResponse(xml) {
  const items = getItems(parseXml(xml));
  const result = {
    type: "AIRPORT_WARNINGS",
    fetched_at: nowIso(),
    total_count: 0,
    airports: {}
  };

  for (const item of items) {
    const icao = firstText(item.icaoCode, item.icao, item.airportIcao);
    if (!icao) continue;

    const warning = mapWarning(item);
    ensureAirportBucket(result, icao, airportName);

    if (warning.wrng_type_key === "WIND_SHEAR" && hasSameWindShear(result, icao, warning)) {
      continue;
    }

    result.airports[icao].warnings.push(warning);
    result.total_count += 1;
  }

  sortWarningsByIssued(result);
  return result;
}
```

## Verification

```bash
node backend/test/run-once.js warning
```
