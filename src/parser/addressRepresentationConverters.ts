import {simpleCellAddress, SimpleCellAddress} from '../Cell'
import {CellAddress} from './CellAddress'

export type SheetMappingFn = (sheetName: string) => number | undefined

const addressRegex = /^(\$([A-Za-z0-9_]+)\.)?(\$?)([A-Za-z]+)(\$?)([0-9]+)$/

/**
 * Computes R0C0 representation of cell address based on it's string representation and base address.
 *
 * @param sheetMapping - mapping function needed to change name of a sheet to index
 * @param stringAddress - string representation of cell address, e.g. 'C64'
 * @param baseAddress - base address for R0C0 conversion
 * @param overrideSheet - override sheet index regardless of sheet mapping
 * @returns object representation of address
 */
export const cellAddressFromString = (sheetMapping: SheetMappingFn, stringAddress: string, baseAddress: SimpleCellAddress, overrideSheet?: number): CellAddress | undefined => {
  const result = stringAddress.match(addressRegex)!

  let col = columnLabelToIndex(result[4])

  let sheet
  if (result[2]) {
    sheet = sheetMapping(result[2])
  } else if (overrideSheet !== undefined) {
    sheet = overrideSheet
  } else {
    sheet = baseAddress.sheet
  }

  if (sheet === undefined) {
    return undefined
  }

  const row = Number(result[6] as string) - 1
  if (result[3] === '$' && result[5] === '$') {
    return CellAddress.absolute(sheet, col, row)
  } else if (result[3] === '$') {
    return CellAddress.absoluteCol(sheet, col, row - baseAddress.row)
  } else if (result[5] === '$') {
    return CellAddress.absoluteRow(sheet, col - baseAddress.col, row)
  } else {
    return CellAddress.relative(sheet, col - baseAddress.col, row - baseAddress.row)
  }
}

/**
 * Computes simple (absolute) address of a cell address based on it's string representation.
 * If sheet name present in string representation but is not present in sheet mapping, returns undefined.
 * If sheet name is not present in string representation, returns {@param overrideSheet} as sheet number
 *
 * @param sheetMapping - mapping function needed to change name of a sheet to index
 * @param stringAddress - string representation of cell address, e.g. 'C64'
 * @param overrideSheet - override sheet index regardless of sheet mapping
 * @returns absolute representation of address, e.g. { sheet: 0, col: 1, row: 1 }
 */
export const simpleCellAddressFromString = (sheetMapping: SheetMappingFn, stringAddress: string, overrideSheet: number = 0): SimpleCellAddress | undefined => {
  const result = stringAddress.match(addressRegex)!

  let col = columnLabelToIndex(result[4])

  let sheet
  if (result[2]) {
    sheet = sheetMapping(result[2])
  } else if (overrideSheet !== undefined) {
    sheet = overrideSheet
  }

  if (sheet === undefined) {
    return undefined
  }

  const row = Number(result[6] as string) - 1
  return simpleCellAddress(sheet, col, row)
}

/**
* Convert column label to index
*
* @param columnStringRepresentation - column label (e.g. 'AAB')
* @returns column index
* */
function columnLabelToIndex(columnStringRepresentation: string): number {
  if (columnStringRepresentation.length === 1) {
    return columnStringRepresentation.toUpperCase().charCodeAt(0) - 65
  } else {
    return columnStringRepresentation.split('').reduce((currentColumn, nextLetter) => {
      return currentColumn * 26 + (nextLetter.toUpperCase().charCodeAt(0) - 64)
    }, 0) - 1
  }
}