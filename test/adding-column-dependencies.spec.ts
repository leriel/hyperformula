import {Config, HandsOnEngine} from '../src'
import {simpleCellAddress, SimpleCellAddress, CellError, ErrorType} from '../src/Cell'
import {EmptyCellVertex, FormulaCellVertex, MatrixVertex} from '../src/DependencyGraph'
import {CellReferenceAst} from '../src/parser/Ast'
import {CellAddress} from '../src/parser/CellAddress'
import './testConfig.ts'
import {extractRange, adr, extractReference, extractMatrixRange} from "./testUtils";
import {AbsoluteCellRange} from "../src/AbsoluteCellRange"

describe('Adding column, fixing dependency', () => {
  describe('all in same sheet (case 1)', () => {
    it('same sheet, case Aa, absolute column', () => {
      const engine = HandsOnEngine.buildFromArray([
        ['1', /* new col */ '=$A1'],
      ])

      engine.addColumns(0, 1, 1)

      expect(extractReference(engine, adr('C1'))).toEqual(CellAddress.absoluteCol(0, 0, 0))
    })

    it('same sheet, case Aa, absolute row and col', () => {
      const engine = HandsOnEngine.buildFromArray([
        ['1', /* new col */ '=$A$1'],
      ])

      engine.addColumns(0, 1, 1)

      expect(extractReference(engine, adr('C1'))).toEqual(CellAddress.absolute(0, 0, 0))
    })

    it('same sheet, case Ab', () => {
      const engine = HandsOnEngine.buildFromArray([
        ['=$B1' /* new col */, '42'],
      ])

      engine.addColumns(0, 1, 1)

      expect(extractReference(engine, adr('A1'))).toEqual(CellAddress.absoluteCol(0, 2, 0))
    })

    it('same sheet, case Raa', () => {
      const engine = HandsOnEngine.buildFromArray([
        ['=B1', '13', /* new col */ '42'],
      ])

      engine.addColumns(0, 2, 1)

      expect(extractReference(engine, adr('A1'))).toEqual(CellAddress.relative(0, 1, 0))
    })

    it('same sheet, case Rab', () => {
      const engine = HandsOnEngine.buildFromArray([
        ['42', '13', /* new col */ '=B1'],
      ])

      engine.addColumns(0, 2, 1)

      expect(extractReference(engine, adr('D1'))).toEqual(CellAddress.relative(0, -2, 0))
    })

    it('same sheet, case Rba', () => {
      const engine = HandsOnEngine.buildFromArray([
        ['=C1', '13', /* new col */ '42'],
      ])

      engine.addColumns(0, 2, 1)

      expect(extractReference(engine, adr('A1'))).toEqual(CellAddress.relative(0, 3, 0))
    })

    it('same sheet, case Rbb', () => {
      const engine = HandsOnEngine.buildFromArray([
        ['42', /* new col */ '=C1', '13'],
      ])

      engine.addColumns(0, 1, 1)

      expect(extractReference(engine, adr('C1'))).toEqual(CellAddress.relative(0, 1, 0))
    })

    it('same sheet, same column', () => {
      const engine = HandsOnEngine.buildFromArray([
        ['42', '43'],
        ['', '=B1'],
      ])

      engine.addColumns(0, 1, 1)

      expect(extractReference(engine, adr('C2'))).toEqual(CellAddress.relative(0, 0, -1))
    })
  })

  describe('dependency address sheet different than formula address sheet and sheet in which we add columns (case 2)', () => {
    it("absolute case", () => {
      const engine = HandsOnEngine.buildFromSheets({
        Sheet1: [
          [ /* new col */ '=$Sheet2.$A1'],
        ],
        Sheet2: [
          ['1'],
        ]
      })

      engine.addColumns(0, 0, 1)

      expect(extractReference(engine, adr("B1"))).toEqual(CellAddress.absoluteCol(1, 0, 0))
    })

    it("R < r", () => {
      const engine = HandsOnEngine.buildFromSheets({
        Sheet1: [
          [/* new col */ '', '=$Sheet2.A1'],
        ],
        Sheet2: [
          ['1'],
        ]
      })

      engine.addColumns(0, 0, 1)

      expect(extractReference(engine, adr("C1"))).toEqual(CellAddress.relative(1, -2, 0))
    })

    it("r = R", () => {
      const engine = HandsOnEngine.buildFromSheets({
        Sheet1: [
          [/* new col */ '=$Sheet2.B1'],
        ],
        Sheet2: [
          ['', '1'],
        ]
      })

      engine.addColumns(0, 0, 1)

      expect(extractReference(engine, adr("B1"))).toEqual(CellAddress.relative(1, 0, 0))
    })

    it("r < R", () => {
      const engine = HandsOnEngine.buildFromSheets({
        Sheet1: [
          ['=$Sheet2.A1' /* new col */ ]
        ],
        Sheet2: [
          ['1'],
        ]
      })

      engine.addColumns(0, 1, 1)

      expect(extractReference(engine, adr("A1"))).toEqual(CellAddress.relative(1, 0, 0))
    })
  })

  describe('formula address sheet different than dependency address sheet and sheet in which we add columns (case 3)', () => {
    it("dependency address before added column", () => {
      const engine = HandsOnEngine.buildFromSheets({
        Sheet1: [
          [/* new col */ '1', '2'],
        ],
        Sheet2: [
          ['=$Sheet1.B1']
        ]
      })

      engine.addColumns(0, 0, 1)

      expect(extractReference(engine, adr("A1", 1))).toEqual(CellAddress.relative(0, 2, 0))
    })

    it("dependency address at added column", () => {
      const engine = HandsOnEngine.buildFromSheets({
        Sheet1: [
          [/* new col */ '1']
        ],
        Sheet2: [
          ['=$Sheet1.A1']
        ]
      })

      engine.addColumns(0, 0, 1)

      expect(extractReference(engine, adr("A1", 1))).toEqual(CellAddress.relative(0, 1, 0))
    })

    it("dependency address after added column", () => {
      const engine = HandsOnEngine.buildFromSheets({
        Sheet1: [
          ['1' /* new col */ ]
        ],
        Sheet2: [
          ['=$Sheet1.A1']
        ]
      })

      engine.addColumns(0, 1, 1)

      expect(extractReference(engine, adr("A1", 1))).toEqual(CellAddress.relative(0, 0, 0))
    })
  })

  describe('sheet where we add columns different than dependency address and formula address (case 4)', () => {
    it('works', () => {
      const engine = HandsOnEngine.buildFromSheets({
        Sheet1: [
          ['=B1', '13'],
        ],
        Sheet2: [
          ['', /* new col */ '78'],
        ],
      })

      engine.addColumns(1, 1, 1)

      expect(extractReference(engine, adr('A1'))).toEqual(CellAddress.relative(0, 1, 0))
    })
  })

  describe('each sheet different (case 5)', () => {
    it('works', () => {
      const engine = HandsOnEngine.buildFromSheets({
        Sheet1: [
          ['=$Sheet2.B1', '13'],
        ],
        Sheet2: [
          ['', '78'],
        ],
        Sheet3: [
          ['', /* new col */ ''],
        ]
      })

      engine.addColumns(2, 1, 1)

      expect(extractReference(engine, adr('A1'))).toEqual(CellAddress.relative(1, 1, 0))
    })
  })
})

describe('Adding column, fixing ranges', () => {
  it('insert column to empty range', () => {
    const engine = HandsOnEngine.buildFromArray([
      ['', /* new col */ '', ''],
      ['=SUM(A1:C1)'],
    ])

    expect(engine.rangeMapping.getRange(adr('A1'), adr('C1'))).not.toBe(null)

    engine.addColumns(0, 1, 1)

    expect(engine.rangeMapping.getRange(adr('A1'), adr('C1'))).toBe(null)
    expect(engine.rangeMapping.getRange(adr('A1'), adr('D1'))).not.toBe(null)
  })

  it('insert column in middle of range', () => {
    const engine = HandsOnEngine.buildFromArray([
      ['1', /* new col */ '2', '3'],
      ['=SUM(A1:C1)'],
    ])

    expect(engine.rangeMapping.getRange(adr('A1'), adr('C1'))).not.toBe(null)

    engine.addColumns(0, 1, 1)

    expect(engine.rangeMapping.getRange(adr('A1'), adr('C1'))).toBe(null)
    expect(engine.rangeMapping.getRange(adr('A1'), adr('D1'))).not.toBe(null)
  })

  it('insert column above range', () => {
    const engine = HandsOnEngine.buildFromArray([
      [/* new col */ '1', '2', '3'],
      ['=SUM(A1:C1)'],
    ])

    expect(engine.rangeMapping.getRange(adr('A1'), adr('C1'))).not.toBe(null)
    engine.addColumns(0, 0, 1)
    expect(engine.rangeMapping.getRange(adr('A1'), adr('C1'))).toBe(null)
    expect(engine.rangeMapping.getRange(adr('B1'), adr('D1'))).not.toBe(null)
  })

  it('insert column below range', () => {
    const engine = HandsOnEngine.buildFromArray([
      ['1', '2', '3' /* new col */],
      ['=SUM(A1:C1)'],
    ])

    expect(engine.rangeMapping.getRange(adr('A1'), adr('C1'))).not.toBe(null)
    engine.addColumns(0, 3, 1)
    expect(engine.rangeMapping.getRange(adr('A1'), adr('C1'))).not.toBe(null)
  })

  it('it should insert new cell with edge to only one range at right', () => {
    const engine = HandsOnEngine.buildFromArray([
      ['1', '2', /* */ '3', '4'],
      ['=SUM(A1:A1)', '=SUM(A1:B1)', /* */ '=SUM(A1:C1)', '=SUM(A1:D1)'],
    ])

    engine.addColumns(0, 2, 1)

    const c1 = engine.addressMapping.fetchCell(adr('C1'))
    const a1d1 = engine.rangeMapping.fetchRange(adr('A1'), adr('D1'))
    const a1e1 = engine.rangeMapping.fetchRange(adr('A1'), adr('E1'))

    expect(engine.graph.existsEdge(c1, a1d1)).toBe(true)
    expect(engine.graph.existsEdge(c1, a1e1)).toBe(true)
    expect(engine.graph.adjacentNodesCount(c1)).toBe(2)
  })

  it ('range start in column', () => {
    const engine = HandsOnEngine.buildFromArray([
      ['1', /* */ '2', '3', '4'],
      ['', /* */ '=SUM(B1:D1)'],
    ])

    engine.addColumns(0, 1, 1)

    const b1 = engine.addressMapping.getCell(adr('B1'))
    expect(b1).toBe(null)
  })

  it('range start before added column', () => {
    const engine = HandsOnEngine.buildFromArray([
      ['1', /* */ '2', '3', '4'],
      ['', /* */ '=SUM(A1:D1)'],
    ])

    engine.addColumns(0, 1, 1)

    const b1 = engine.addressMapping.fetchCell(adr('B1'))
    const range = engine.rangeMapping.fetchRange(adr('A1'), adr('E1'))
    expect(b1).toBeInstanceOf(EmptyCellVertex)
    expect(engine.graph.existsEdge(b1, range)).toBe(true)
  })

  it ('range start after added column', () => {
    const engine = HandsOnEngine.buildFromArray([
      ['1', /* */ '2', '3', '4'],
      ['', /* */ '=SUM(C1:D1)'],
    ])

    engine.addColumns(0, 1, 1)

    const b1 = engine.addressMapping.getCell(adr('B1'))
    expect(b1).toBe(null)
  })

  it ('range end before added column', () => {
    const engine = HandsOnEngine.buildFromArray([
      ['1', /* */ '2', '3', '4'],
      ['', /* */ '=SUM(A1:A1)'],
    ])

    engine.addColumns(0, 1, 1)

    const b1 = engine.addressMapping.getCell(adr('B1'))
    expect(b1).toBe(null)
  })

  it ('range end in a added column', () => {
    const engine = HandsOnEngine.buildFromArray([
      ['1', /* */ '2', '3', '4'],
      ['', /* */ '=SUM(A1:B1)'],
    ])

    engine.addColumns(0, 1, 1)

    const b1 = engine.addressMapping.fetchCell(adr('B1'))

    const range = engine.rangeMapping.fetchRange(adr('A1'), adr('C1'))
    expect(b1).toBeInstanceOf(EmptyCellVertex)
    expect(engine.graph.existsEdge(b1, range)).toBe(true)
  })

  it ('range end after added column', () => {
    const engine = HandsOnEngine.buildFromArray([
      ['1', /* */ '2', '3', '4'],
      ['', /* */ '=SUM(A1:C1)'],
    ])

    engine.addColumns(0, 1, 1)

    const b1 = engine.addressMapping.fetchCell(adr('B1'))

    const range = engine.rangeMapping.fetchRange(adr('A1'), adr('D1'))
    expect(b1).toBeInstanceOf(EmptyCellVertex)
    expect(engine.graph.existsEdge(b1, range)).toBe(true)
  })

  it ('range start and end in an added column', () => {
    const engine = HandsOnEngine.buildFromArray([
      ['1', /* */ '2', '3', '4'],
      ['', /* */ '=SUM(B1:B1)'],
    ])

    engine.addColumns(0, 1, 1)

    const b1 = engine.addressMapping.getCell(adr('B1'))
    expect(b1).toBe(null)
  })
})