import {benchmark, ExpectedValue} from '../benchmark'

export function sheet() {
  const rows = 10000

  const sheet = []
  sheet.push(['1', '2', '3', '4', '5'])

  let prev = 1

  while (prev < rows) {
    let rowToPush = [
      `${prev+1}`,
      '3',
      `=A${prev}*A${prev}`,
      `=C${prev+1}*A${prev}+B${prev}`,
      `=C${prev}-D${prev}*D${prev}+D${prev}*C${prev}/7+C${prev}*C${prev}*3+7*2`
    ]

    sheet.push(rowToPush)
    ++prev
  }
  return sheet
}

export function expectedValues(sheet: string[][]): ExpectedValue[] {
  return [
    { address: 'A10000', value: 10000 },
    { address: 'B10000', value: 2 },
    { address: 'C10000', value: 3 },
    { address: 'D10000', value: 48 },
    { address: 'E10000', value: 9999 - 2*2 + 2*9999/2 + 2*2 },
  ]
}
