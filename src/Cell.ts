import {Matrix} from './Matrix'
import {CellAddress} from './parser'

/**
 * Possible errors returned by our interpreter.
 */
export enum ErrorType {
  /** Division by zero. */
  DIV_BY_ZERO = 'DIV_BY_ZERO',

  /** Unknown function name. */
  NAME = 'NAME',
  VALUE = 'VALUE',
  NUM = 'NUM',
  NA = 'NA',

  /** Cyclic dependency. */
  CYCLE = 'CYCLE',

  /* Wrong address reference. */
  REF = 'REF',
}

export enum CellType {
  FORMULA = 'FORMULA',
  VALUE = 'VALUE',
  MATRIX = 'MATRIX',
  EMPTY = 'EMPTY'
}

export class CellError {
  constructor(public readonly type: ErrorType) {
  }
}

export const EmptyValue = Symbol()
export type EmptyValueType = typeof EmptyValue
export type CellValue = boolean | string | number | CellError | EmptyValueType

export interface SimpleCellAddress {
  col: number,
  row: number,
  sheet: number,
}

export const simpleCellAddress = (sheet: number, col: number, row: number): SimpleCellAddress => ({sheet, col, row})
export const invalidSimpleCellAddress = (address: SimpleCellAddress): boolean => (address.col < 0 || address.row < 0)
export const movedSimpleCellAddress = (address: SimpleCellAddress, toSheet: number, toRight: number, toBottom: number): SimpleCellAddress => {
  return simpleCellAddress(toSheet, address.col + toRight, address.row + toBottom)
}

export interface SheetCellAddress {
  col: number,
  row: number,
}

export const sheetCellAddress = (col: number, row: number): SheetCellAddress => ({col, row})

export interface CellRange {
  start: CellAddress,
  end: CellAddress,
}

export const buildCellRange = (start: CellAddress, end: CellAddress): CellRange => ({start, end})
