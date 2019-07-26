import {CellError, CellValue, ErrorType, simpleCellAddress, SimpleCellAddress} from './Cell'
import {Config} from './Config'
import {
  AddressMapping,
  DependencyGraph,
  EmptyCellVertex,
  FormulaCellVertex,
  Graph,
  MatrixVertex,
  RangeMapping,
  SheetMapping,
  ValueCellVertex,
  Vertex,
} from './DependencyGraph'
import {MatrixMapping} from './DependencyGraph/MatrixMapping'
import {Evaluator} from './Evaluator'
import {buildMatrixVertex, GraphBuilder, Sheet, Sheets} from './GraphBuilder'
import {
  Ast,
  AstNodeType,
  buildCellErrorAst,
  cellAddressFromString,
  isFormula,
  isMatrix,
  ParserWithCaching,
  ProcedureAst,
} from './parser'
import {CellAddress} from './parser/CellAddress'
import {SingleThreadEvaluator} from './SingleThreadEvaluator'
import {Statistics, StatType} from './statistics/Statistics'
import {AbsoluteCellRange} from "./AbsoluteCellRange";


/**
 * Engine for one sheet
 */
export class HandsOnEngine {
  /**
   * Builds engine for sheet from two-dimmensional array representation
   *
   * @param sheet - two-dimmensional array representation of sheet
   */
  public static buildFromArray(sheet: Sheet, config: Config = new Config()): HandsOnEngine {
    const engine = new HandsOnEngine(config)
    engine.buildFromSheets({Sheet1: sheet})
    return engine
  }

  public static buildFromSheets(sheets: Sheets, config: Config = new Config()): HandsOnEngine {
    const engine = new HandsOnEngine(config)
    engine.buildFromSheets(sheets)
    return engine
  }

  /** Address mapping from addresses to vertices from graph. */
  public addressMapping?: AddressMapping

  /** Range mapping from ranges to vertices representing these ranges. */
  public readonly rangeMapping: RangeMapping = new RangeMapping()

  /** Directed graph of cell dependencies. */
  public readonly graph: Graph<Vertex> = new Graph<Vertex>()

  public dependencyGraph?: DependencyGraph

  /** Statistics module for benchmarking */
  public readonly stats: Statistics = new Statistics()

  public readonly sheetMapping = new SheetMapping()

  public readonly matrixMapping = new MatrixMapping()

  /** Formula evaluator */
  private evaluator?: Evaluator

  private readonly parser: ParserWithCaching

  private graphBuilder?: GraphBuilder

  constructor(
      public readonly config: Config,
  ) {
    this.parser = new ParserWithCaching(this.config, this.sheetMapping.fetch)
  }

  public buildFromSheets(sheets: Sheets) {
    this.stats.reset()
    this.stats.start(StatType.OVERALL)

    this.addressMapping = AddressMapping.build(this.config.addressMappingFillThreshold)
    for (const sheetName in sheets) {
      const sheetId = this.sheetMapping.addSheet(sheetName)
      this.addressMapping!.autoAddSheet(sheetId, sheets[sheetName])
    }

    this.dependencyGraph = new DependencyGraph(this.addressMapping, this.rangeMapping, this.graph, this.sheetMapping, this.matrixMapping)
    this.graphBuilder = new GraphBuilder(this.dependencyGraph, this.parser, this.config, this.stats)

    this.stats.measure(StatType.GRAPH_BUILD, () => {
      this.graphBuilder!.buildGraph(sheets)
    })

    this.evaluator = new SingleThreadEvaluator(this.dependencyGraph, this.config, this.stats)

    this.evaluator!.run()

    this.stats.end(StatType.OVERALL)
  }

  /**
   * Returns value of the cell with the given address
   *
   * @param stringAddress - cell coordinates (e.g. 'A1')
   */
  public getCellValue(stringAddress: string): CellValue {
    const address = cellAddressFromString(this.sheetMapping.fetch, stringAddress, CellAddress.absolute(0, 0, 0))
    return this.dependencyGraph!.getCellValue(address)
  }

  /**
   * Returns array with values of all cells
   * */
  public getValues(sheet: number): CellValue[][] {
    const sheetHeight = this.dependencyGraph!.getSheetHeight(sheet)
    const sheetWidth = this.dependencyGraph!.getSheetWidth(sheet)

    const arr: CellValue[][] = new Array(sheetHeight)
    for (let i = 0; i < sheetHeight; i++) {
      arr[i] = new Array(sheetWidth)

      for (let j = 0; j < sheetWidth; j++) {
        const address = simpleCellAddress(sheet, j, i)
        arr[i][j] = this.dependencyGraph!.getCellValue(address)
      }
    }

    return arr
  }

  public getSheetsDimensions(): Map<string, { width: number, height: number }> {
    const sheetDimensions = new Map<string, { width: number, height: number }>()
    for (const sheetName of this.sheetMapping.names()) {
      const sheetId = this.sheetMapping.fetch(sheetName)
      sheetDimensions.set(sheetName, {
        width: this.dependencyGraph!.getSheetWidth(sheetId),
        height: this.dependencyGraph!.getSheetHeight(sheetId),
      })
    }
    return sheetDimensions
  }

  /**
   * Returns snapshot of a computation time statistics
   */
  public getStats() {
    return this.stats.snapshot()
  }

  /**
   * Sets content of a cell with given address
   *
   * @param stringAddress - cell coordinates (e.g. 'A1')
   * @param newCellContent - new cell content
   */
  public setCellContent(address: SimpleCellAddress, newCellContent: string) {
    const vertex = this.dependencyGraph!.getCell(address)
    let verticesToRecomputeFrom: Vertex[]

    if (vertex instanceof MatrixVertex && !vertex.isFormula() && !isNaN(Number(newCellContent))) {
      vertex.setMatrixCellValue(address, Number(newCellContent))
      verticesToRecomputeFrom = [vertex]
    } else if (!(vertex instanceof MatrixVertex) && isMatrix(newCellContent)) {
      const matrixFormula = newCellContent.substr(1, newCellContent.length - 2)
      const parseResult = this.parser.parse(matrixFormula, address)

      const {vertex: newVertex, size} = buildMatrixVertex(parseResult.ast as ProcedureAst, address)

      if (!size || !(newVertex instanceof MatrixVertex)) {
        throw Error('What if new matrix vertex is not properly constructed?')
      }

      this.dependencyGraph!.addNewMatrixVertex(newVertex)
      const {dependencies} = this.parser.getAbsolutizedParserResult(parseResult.hash, address)
      this.dependencyGraph!.processCellDependencies(dependencies, newVertex)
      verticesToRecomputeFrom = [newVertex]
    } else if (vertex instanceof FormulaCellVertex || vertex instanceof ValueCellVertex || vertex instanceof EmptyCellVertex || vertex === null) {
      if (isFormula(newCellContent)) {
        const {ast, hash} = this.parser.parse(newCellContent, address)
        const {dependencies} = this.parser.getAbsolutizedParserResult(hash, address)
        this.dependencyGraph!.setFormulaToCell(address, ast, dependencies)
      } else if (newCellContent === '') {
        this.dependencyGraph!.setCellEmpty(address)
      } else if (!isNaN(Number(newCellContent))) {
        this.dependencyGraph!.setValueToCell(address, Number(newCellContent))
      } else {
        this.dependencyGraph!.setValueToCell(address, newCellContent)
      }
      verticesToRecomputeFrom = Array.from(this.dependencyGraph!.verticesToRecompute())
      this.dependencyGraph!.clearRecentlyChangedVertices()
    } else {
      throw new Error('Illegal operation')
    }

    if (verticesToRecomputeFrom) {
      this.evaluator!.partialRun(verticesToRecomputeFrom)
    }
  }

  public addRows(sheet: number, row: number, numberOfRowsToAdd: number = 1) {
    this.dependencyGraph!.addRows(sheet, row, numberOfRowsToAdd)

    for (const node of this.dependencyGraph!.nodes()) {
      if (node instanceof FormulaCellVertex && node.getAddress().sheet === sheet) {
        const newAst = transformAddressesInFormula(
          node.getFormula(), node.getAddress(),
          fixRowDependency(sheet, row, numberOfRowsToAdd),
        )
        const cachedAst = this.parser.rememberNewAst(newAst)
        node.setFormula(cachedAst)
        this.fixFormulaVertexAddress(node, row, numberOfRowsToAdd)
      }
    }

    this.evaluator!.run()
  }

  public removeRows(sheet: number, rowStart: number, rowEnd: number = rowStart) {
    // 1. Remove nodes from graph
    this.dependencyGraph!.removeRows(sheet, rowStart, rowEnd)

    const numberOfRowsToDelete = rowEnd - rowStart + 1
    // 3. Fix dependencies
    for (const node of this.dependencyGraph!.nodes()) {
      if (node instanceof FormulaCellVertex && node.getAddress().sheet === sheet) {
        const newAst = transformAddressesInFormula(
          node.getFormula(),
          node.getAddress(),
          fixRowDependencyRowsDeletion(sheet, rowStart, numberOfRowsToDelete),
        )
        const cachedAst = this.parser.rememberNewAst(newAst)
        node.setFormula(cachedAst)
        this.fixFormulaVertexAddress(node, rowStart, -numberOfRowsToDelete)
      }
    }

    this.evaluator!.run()
  }

  public addColumns(sheet: number, col: number, numberOfCols: number = 1) {
    this.dependencyGraph!.addColumns(sheet, col, numberOfCols)

    for (const node of this.dependencyGraph!.formulaNodesFromSheet(sheet)) {
      const newAst = transformAddressesInFormula(node.getFormula(), node.getAddress(), fixColDependency(sheet, col, numberOfCols))
      const cachedAst = this.parser.rememberNewAst(newAst)
      node.setFormula(cachedAst)
      this.fixFormulaVertexAddressByColumn(node, col, numberOfCols)
    }

    this.evaluator!.run()
  }

  public removeColumns(sheet: number, columnStart: number, columnEnd: number = columnStart) {
    this.dependencyGraph!.removeColumns(sheet, columnStart, columnEnd)

    const numberOfColumnsToDelete = columnEnd - columnStart + 1
    for (const node of this.dependencyGraph!.formulaNodesFromSheet(sheet)) {
      const newAst = transformAddressesInFormula(
        node.getFormula(),
        node.getAddress(),
        fixColumnDependencyColumnsDeletion(sheet, columnStart, numberOfColumnsToDelete),
      )
      const cachedAst = this.parser.rememberNewAst(newAst)
      node.setFormula(cachedAst)
      this.fixFormulaVertexAddressByColumn(node, columnStart, -numberOfColumnsToDelete)
    }

    this.evaluator!.run()
  }

  public moveCells(sourceLeftCorner: SimpleCellAddress, width: number, height: number, destinationLeftCorner: SimpleCellAddress) {
    const sourceRange = AbsoluteCellRange.spanFrom(sourceLeftCorner, width, height)
    const toRight = destinationLeftCorner.col - sourceLeftCorner.col
    const toBottom = destinationLeftCorner.row - sourceLeftCorner.row
    const toSheet = destinationLeftCorner.sheet

    this.dependencyGraph!.moveCells(sourceRange, toRight, toBottom, toSheet)

    /* Fix dependencies in formulas dependent on moved cells */
    for (const node of this.dependencyGraph!.formulaNodesFromSheet(sourceLeftCorner.sheet)) {
      const newAst = transformAddressesWhenMovingCells(
          node.getFormula(),
          node.getAddress(),
          sourceRange,
          toRight,
          toBottom
      )
      const cachedAst = this.parser.rememberNewAst(newAst)
      node.setFormula(cachedAst)
    }

    /* Fix formulas in moved cells */
    for (const node of this.dependencyGraph!.formulaVerticesInRange(sourceRange)) {
      const newAst = transformAddressesInFormula(
          node.getFormula(),
          node.getAddress(),
          fixDependenciesInMovedCells(-toRight, -toBottom)
      )
      const cachedAst = this.parser.rememberNewAst(newAst)
      node.setFormula(cachedAst)
      node.setAddress({
        sheet: node.address.sheet,
        col: node.address.col + toRight,
        row: node.address.row + toBottom
      })
    }
  }

  public disableNumericMatrices() {
    this.dependencyGraph!.disableNumericMatrices()
  }

  public recomputeIfDependencyGraphNeedsIt() {
    const verticesToRecomputeFrom = Array.from(this.dependencyGraph!.verticesToRecompute())
    this.dependencyGraph!.clearRecentlyChangedVertices()

    if (verticesToRecomputeFrom) {
      this.evaluator!.partialRun(verticesToRecomputeFrom)
    }
  }

  private fixFormulaVertexAddress(node: FormulaCellVertex, row: number, numberOfRows: number) {
    const nodeAddress = node.getAddress()
    if (row <= nodeAddress.row) {
      node.setAddress({
        ...nodeAddress,
        row: nodeAddress.row + numberOfRows,
      })
    }
  }

  private fixFormulaVertexAddressByColumn(node: FormulaCellVertex, column: number, numberOfColumns: number) {
    const nodeAddress = node.getAddress()
    if (column <= nodeAddress.col) {
      node.setAddress({
        ...nodeAddress,
        col: nodeAddress.col + numberOfColumns,
      })
    }
  }
}

export type TransformCellAddressFunction = (dependencyAddress: CellAddress, formulaAddress: SimpleCellAddress) => CellAddress | ErrorType.REF | false

export function fixRowDependencyRowsDeletion(sheetInWhichWeRemoveRows: number, topRow: number, numberOfRows: number): TransformCellAddressFunction {
  return (dependencyAddress: CellAddress, formulaAddress: SimpleCellAddress) => {
    if ((dependencyAddress.sheet === formulaAddress.sheet)
        && (formulaAddress.sheet !== sheetInWhichWeRemoveRows)) {
      return false
    }

    if (dependencyAddress.isRowAbsolute()) {
      if (sheetInWhichWeRemoveRows !== dependencyAddress.sheet) {
        return false
      }

      if (dependencyAddress.row < topRow) { // Aa
        return false
      } else if (dependencyAddress.row >= topRow + numberOfRows) { // Ab
        return dependencyAddress.shiftedByRows(-numberOfRows)
      }
    } else {
      const absolutizedDependencyAddress = dependencyAddress.toSimpleCellAddress(formulaAddress)
      if (absolutizedDependencyAddress.row < topRow) {
        if (formulaAddress.row < topRow) {  // Raa
          return false
        } else if (formulaAddress.row >= topRow + numberOfRows) { // Rab
          return dependencyAddress.shiftedByRows(numberOfRows)
        }
      } else if (absolutizedDependencyAddress.row >= topRow + numberOfRows) {
        if (formulaAddress.row < topRow) {  // Rba
          return dependencyAddress.shiftedByRows(-numberOfRows)
        } else if (formulaAddress.row >= topRow + numberOfRows) { // Rbb
          return false
        }
      }
    }

    return ErrorType.REF
  }
}

export function fixColumnDependencyColumnsDeletion(sheetInWhichWeRemoveColumns: number, leftmostColumn: number, numberOfColumns: number): TransformCellAddressFunction {
  return (dependencyAddress: CellAddress, formulaAddress: SimpleCellAddress) => {
    if ((dependencyAddress.sheet === formulaAddress.sheet)
        && (formulaAddress.sheet !== sheetInWhichWeRemoveColumns)) {
      return false
    }

    if (dependencyAddress.isColumnAbsolute()) {
      if (sheetInWhichWeRemoveColumns !== dependencyAddress.sheet) {
        return false
      }

      if (dependencyAddress.col < leftmostColumn) { // Aa
        return false
      } else if (dependencyAddress.col >= leftmostColumn + numberOfColumns) { // Ab
        return dependencyAddress.shiftedByColumns(-numberOfColumns)
      }
    } else {
      const absolutizedDependencyAddress = dependencyAddress.toSimpleCellAddress(formulaAddress)
      if (absolutizedDependencyAddress.col < leftmostColumn) {
        if (formulaAddress.col < leftmostColumn) {  // Raa
          return false
        } else if (formulaAddress.col >= leftmostColumn + numberOfColumns) { // Rab
          return dependencyAddress.shiftedByColumns(numberOfColumns)
        }
      } else if (absolutizedDependencyAddress.col >= leftmostColumn + numberOfColumns) {
        if (formulaAddress.col < leftmostColumn) {  // Rba
          return dependencyAddress.shiftedByColumns(-numberOfColumns)
        } else if (formulaAddress.col >= leftmostColumn + numberOfColumns) { // Rbb
          return false
        }
      }
    }

    return ErrorType.REF
  }
}

export function fixRowDependency(sheetInWhichWeAddRows: number, row: number, numberOfRows: number): TransformCellAddressFunction {
  return (dependencyAddress: CellAddress, formulaAddress: SimpleCellAddress) => {
    if ((dependencyAddress.sheet === formulaAddress.sheet)
        && (formulaAddress.sheet !== sheetInWhichWeAddRows)) {
      return false
    }

    if (dependencyAddress.isRowAbsolute()) {
      if (sheetInWhichWeAddRows !== dependencyAddress.sheet) {
        return false
      }

      if (dependencyAddress.row < row) { // Case Aa
        return false
      } else { // Case Ab
        return dependencyAddress.shiftedByRows(numberOfRows)
      }
    } else {
      const absolutizedDependencyAddress = dependencyAddress.toSimpleCellAddress(formulaAddress)
      if (absolutizedDependencyAddress.row < row) {
        if (formulaAddress.row < row) { // Case Raa
          return false
        } else { // Case Rab
          return dependencyAddress.shiftedByRows(-numberOfRows)
        }
      } else {
        if (formulaAddress.row < row) { // Case Rba
          return dependencyAddress.shiftedByRows(numberOfRows)
        } else { // Case Rbb
          return false
        }
      }
    }
  }
}

export function fixColDependency(sheetInWhichWeAddColumns: number, column: number, numberOfColumns: number): TransformCellAddressFunction {
  return (dependencyAddress: CellAddress, formulaAddress: SimpleCellAddress) => {
    if ((dependencyAddress.sheet === formulaAddress.sheet) && (formulaAddress.sheet !== sheetInWhichWeAddColumns)) {
      return false
    }

    if (dependencyAddress.isColumnAbsolute()) {
      if (sheetInWhichWeAddColumns !== dependencyAddress.sheet) {
        return false
      }

      if (dependencyAddress.col < column) { // Case Aa
        return false
      } else { // Case Ab
        return dependencyAddress.shiftedByColumns(numberOfColumns)
      }
    } else {
      const absolutizedDependencyAddress = dependencyAddress.toSimpleCellAddress(formulaAddress)
      if (absolutizedDependencyAddress.col < column) {
        if (formulaAddress.col < column) { // Case Raa
          return false
        } else { // Case Rab
          return dependencyAddress.shiftedByColumns(-numberOfColumns)
        }
      } else {
        if (formulaAddress.col < column) { // Case Rba
          return dependencyAddress.shiftedByColumns(numberOfColumns)
        } else { // Case Rbb
          return false
        }
      }
    }
  }
}

export function fixDependenciesInMovedCells(toRight: number, toBottom: number): TransformCellAddressFunction {
  return (dependencyAddress: CellAddress, _) => {
    return dependencyAddress.adjusted(toRight, toBottom)
  }
}

export function transformAddressesInFormula(ast: Ast, address: SimpleCellAddress, transformCellAddressFn: TransformCellAddressFunction): Ast {
  switch (ast.type) {
    case AstNodeType.CELL_REFERENCE: {
      const newCellAddress = transformCellAddressFn(ast.reference, address)
      if (newCellAddress instanceof CellAddress) {
        return {...ast, reference: newCellAddress}
      } else if (newCellAddress === ErrorType.REF) {
        return buildCellErrorAst(new CellError(ErrorType.REF))
      } else {
        return ast
      }
    }
    case AstNodeType.CELL_RANGE: {
      const newStart = transformCellAddressFn(ast.start, address)
      const newEnd = transformCellAddressFn(ast.end, address)
      if (newStart === ErrorType.REF) {
        return buildCellErrorAst(new CellError(ErrorType.REF))
      }
      if (newEnd === ErrorType.REF) {
        return buildCellErrorAst(new CellError(ErrorType.REF))
      }
      if (newStart || newEnd) {
        return {
          ...ast,
          start: newStart || ast.start,
          end: newEnd || ast.end,
        }
      } else {
        return ast
      }
    }
    case AstNodeType.ERROR:
    case AstNodeType.NUMBER:
    case AstNodeType.STRING: {
      return ast
    }
    case AstNodeType.MINUS_UNARY_OP: {
      return {
        type: ast.type,
        value: transformAddressesInFormula(ast.value, address, transformCellAddressFn),
      }
    }
    case AstNodeType.FUNCTION_CALL: {
      return {
        type: ast.type,
        procedureName: ast.procedureName,
        args: ast.args.map((arg) => transformAddressesInFormula(arg, address, transformCellAddressFn)),
      }
    }
    default: {
      return {
        type: ast.type,
        left: transformAddressesInFormula(ast.left, address, transformCellAddressFn),
        right: transformAddressesInFormula(ast.right, address, transformCellAddressFn),
      } as Ast
    }
  }
}

export function fixDependenciesWhenMovingCells(dependencyAddress: CellAddress, formulaAddress: SimpleCellAddress, sourceArea: AbsoluteCellRange, toRight: number, toBottom: number) {
  if (sourceArea.addressInRange(dependencyAddress.toSimpleCellAddress(formulaAddress))) {
    return dependencyAddress
        .shiftedByColumns(toRight)
        .shiftedByRows(toBottom)
  }
  return false
}

export function transformAddressesWhenMovingCells(ast: Ast, address: SimpleCellAddress, sourceArea: AbsoluteCellRange, toRight: number, toBottom: number): Ast {
  switch (ast.type) {
    case AstNodeType.CELL_REFERENCE: {
      const newCellAddress = fixDependenciesWhenMovingCells(ast.reference, address, sourceArea, toRight, toBottom)
      if (newCellAddress) {
        return {...ast, reference: newCellAddress}
      } else {
        return ast
      }
    }
    case AstNodeType.CELL_RANGE: {
      const newStart = fixDependenciesWhenMovingCells(ast.start, address, sourceArea, toRight, toBottom)
      const newEnd = fixDependenciesWhenMovingCells(ast.end, address, sourceArea, toRight, toBottom)
      if (newStart && newEnd) {
        return {
          ...ast,
          start: newStart,
          end: newEnd,
        }
      } else {
        return ast
      }
    }
    case AstNodeType.ERROR:
    case AstNodeType.NUMBER:
    case AstNodeType.STRING: {
      return ast
    }
    case AstNodeType.MINUS_UNARY_OP: {
      return {
        type: ast.type,
        value: transformAddressesWhenMovingCells(ast.value, address, sourceArea, toRight, toBottom),
      }
    }
    case AstNodeType.FUNCTION_CALL: {
      return {
        type: ast.type,
        procedureName: ast.procedureName,
        args: ast.args.map((arg) => transformAddressesWhenMovingCells(arg, address, sourceArea, toRight, toBottom))
      }
    }
    default: {
      return {
        type: ast.type,
        left: transformAddressesWhenMovingCells(ast.left, address, sourceArea, toRight, toBottom),
        right: transformAddressesWhenMovingCells(ast.right, address, sourceArea, toRight, toBottom)
      } as Ast
    }
  }

}
