import {Config, HyperFormula} from '../../src'
import {AbsoluteCellRange} from '../../src/AbsoluteCellRange'
import { simpleCellAddress} from '../../src/Cell'
import { FormulaCellVertex, MatrixVertex} from '../../src/DependencyGraph'
import '../testConfig'
import {adr, expect_array_with_same_content, extractMatrixRange, extractRange} from '../testUtils'
import {ColumnIndex} from "../../src/ColumnSearch/ColumnIndex";

describe('Adding column - checking if its possible', () => {
  it('no if starting column is negative', () => {
    const engine = HyperFormula.buildFromArray([[]])

    expect(engine.isItPossibleToAddColumns(0, -1, 1)).toEqual(false)
  })

  it('no if starting column is not an integer', () => {
    const engine = HyperFormula.buildFromArray([[]])

    expect(engine.isItPossibleToAddColumns(0, 1.5, 1)).toEqual(false)
  })

  it('no if starting column is NaN/Infinity', () => {
    const engine = HyperFormula.buildFromArray([[]])

    expect(engine.isItPossibleToAddColumns(0, NaN, 1)).toEqual(false)
    expect(engine.isItPossibleToAddColumns(0, Infinity, 1)).toEqual(false)
    expect(engine.isItPossibleToAddColumns(0, -Infinity, 1)).toEqual(false)
  })

  it('no if number of columns is not positive', () => {
    const engine = HyperFormula.buildFromArray([[]])

    expect(engine.isItPossibleToAddColumns(0, 0, 0)).toEqual(false)
  })

  it('no if number of columns is not an integer', () => {
    const engine = HyperFormula.buildFromArray([[]])

    expect(engine.isItPossibleToAddColumns(0, 0, 1.5)).toEqual(false)
  })

  it('no if number of columns is NaN/Infinity', () => {
    const engine = HyperFormula.buildFromArray([[]])

    expect(engine.isItPossibleToAddColumns(0, 0, NaN)).toEqual(false)
    expect(engine.isItPossibleToAddColumns(0, 0, Infinity)).toEqual(false)
    expect(engine.isItPossibleToAddColumns(0, 0, -Infinity)).toEqual(false)
  })

  it('no if sheet does not exist', () => {
    const engine = HyperFormula.buildFromArray([[]])

    expect(engine.isItPossibleToAddColumns(1, 0, 1)).toEqual(false)
    expect(engine.isItPossibleToAddColumns(1.5, 0, 1)).toEqual(false)
    expect(engine.isItPossibleToAddColumns(-1, 0, 1)).toEqual(false)
    expect(engine.isItPossibleToAddColumns(NaN, 0, 1)).toEqual(false)
    expect(engine.isItPossibleToAddColumns(Infinity, 0, 1)).toEqual(false)
    expect(engine.isItPossibleToAddColumns(-Infinity, 0, 1)).toEqual(false)
  })

  it('no if theres a formula matrix in place where we add', () => {
    const engine = HyperFormula.buildFromArray([
      ['1', '2', '{=TRANSPOSE(A1:B2)}', '{=TRANSPOSE(A1:B2)}', '13'],
      ['3', '4', '{=TRANSPOSE(A1:B2)}', '{=TRANSPOSE(A1:B2)}'],
    ])

    expect(engine.isItPossibleToAddColumns(0, 1, 1)).toEqual(true)
    expect(engine.isItPossibleToAddColumns(0, 2, 1)).toEqual(false)
    expect(engine.isItPossibleToAddColumns(0, 3, 1)).toEqual(false)
    expect(engine.isItPossibleToAddColumns(0, 4, 1)).toEqual(true)
  })

  it('yes if theres a numeric matrix in place where we add', () => {
    const config = new Config({matrixDetection: true, matrixDetectionThreshold: 1})
    const engine = HyperFormula.buildFromArray([
      ['1', '2'],
      ['3', '4'],
    ], config)
    expect(engine.matrixMapping.matrixMapping.size).toEqual(1)

    expect(engine.isItPossibleToAddColumns(0, 0, 1)).toEqual(true)
    expect(engine.isItPossibleToAddColumns(0, 1, 1)).toEqual(true)
  })

  it('yes otherwise', () => {
    const engine = HyperFormula.buildFromArray([[]])

    expect(engine.isItPossibleToAddColumns(0, 0, 1)).toEqual(true)
  })
})

describe('Adding column - matrix check', () => {
  it('raise error if trying to add a row in a row with matrix', () => {
    const engine = HyperFormula.buildFromArray([
      ['1', '2'],
      ['3', '4'],
      ['{=TRANSPOSE(A1:B2)}', '{=TRANSPOSE(A1:B2)}'],
      ['{=TRANSPOSE(A1:B2)}', '{=TRANSPOSE(A1:B2)}'],
      ['13'],
    ])

    expect(() => {
      engine.addColumns(0, [0, 1])
    }).toThrow(new Error('It is not possible to add column in column with matrix'))

    expect(() => {
      engine.addColumns(0, [0, 1])
    }).toThrow(new Error('It is not possible to add column in column with matrix'))
  })
})

describe('Adding column - reevaluation', () => {
  it('reevaluates cells', () => {
    const engine = HyperFormula.buildFromArray([
      ['1', /* new col */ '2', '=COUNTBLANK(A1:B1)'],
    ])

    expect(engine.getCellValue(adr('C1'))).toEqual(0)
    engine.addColumns(0, [1, 1])
    expect(engine.getCellValue(adr('D1'))).toEqual(1)
  })

  it('dont reevaluate everything', () => {
    const engine = HyperFormula.buildFromArray([
      ['1', /* new col */ '2', '=COUNTBLANK(A1:B1)'],
      ['=SUM(A1:A1)'],
    ])
    const c1 = engine.addressMapping.getCell(adr('C1'))
    const a2 = engine.addressMapping.getCell(adr('A2'))
    const c1setCellValueSpy = jest.spyOn(c1 as any, 'setCellValue')
    const a2setCellValueSpy = jest.spyOn(a2 as any, 'setCellValue')

    engine.addColumns(0, [1, 1])

    expect(a2setCellValueSpy).not.toHaveBeenCalled()
    expect(c1setCellValueSpy).toHaveBeenCalled()
  })

  it('reevaluates cells which are dependent on structure changes', () => {
    const engine = HyperFormula.buildFromArray([
      ['1', /* */ '2', '=COLUMNS(A1:B1)'],
    ])
    const c1 = engine.addressMapping.getCell(adr('C1'))
    const c1setCellValueSpy = jest.spyOn(c1 as any, 'setCellValue')

    engine.addColumns(0, [1, 1])

    expect(c1setCellValueSpy).toHaveBeenCalled()
    expect(extractRange(engine, adr('D1'))).toEqual(new AbsoluteCellRange(adr('A1'), adr('C1')))
  })

  it('returns changed values', () => {
    const engine = HyperFormula.buildFromArray([
      /* */
      ['1', '2', '=COLUMNS(A1:B1)'],
    ])
    const c1 = engine.addressMapping.getCell(adr('C1'))

    const changes = engine.addColumns(0, [1, 1])

    expect(changes.length).toBe(1)
    expect(changes).toContainEqual({ sheet: 0, col: 3, row: 0, value: 3 })
  })
})

describe('Adding column - FormulaCellVertex#address update', () => {
  it('updates addresses in formulas', () => {
    const engine = HyperFormula.buildFromArray([
      ['1', /* new col */ '=A1'],
    ])

    engine.addColumns(0, [1, 1])

    const c1 = engine.addressMapping.getCell(adr('C1')) as FormulaCellVertex
    expect(c1).toBeInstanceOf(FormulaCellVertex)
    expect(c1.getAddress(engine.lazilyTransformingAstService)).toEqual(adr('C1'))
  })
})

describe('Adding column', () => {
  it('MatrixVertex#formula should be updated', () => {
    const engine = HyperFormula.buildFromArray([
      ['1', '2', '{=TRANSPOSE(A1:B2)}', '{=TRANSPOSE(A1:B2)}'],
      ['3', '4', '{=TRANSPOSE(A1:B2)}', '{=TRANSPOSE(A1:B2)}'],
    ])

    engine.addColumns(0, [1, 1])

    expect(extractMatrixRange(engine, adr('D1'))).toEqual(new AbsoluteCellRange(adr('A1'), adr('C2')))
  })

  it('MatrixVertex#address should be updated', () => {
    const engine = HyperFormula.buildFromArray([
      ['1', '2', '{=TRANSPOSE(A1:B2)}', '{=TRANSPOSE(A1:B2)}'],
      ['3', '4', '{=TRANSPOSE(A1:B2)}', '{=TRANSPOSE(A1:B2)}'],
    ])

    engine.addColumns(0, [1, 1])

    const matrixVertex = engine.addressMapping.fetchCell(adr('D1')) as MatrixVertex
    expect(matrixVertex.cellAddress).toEqual(adr('D1'))
  })

  it('MatrixVertex#formula should be updated when different sheets', () => {
    const engine = HyperFormula.buildFromSheets({
      Sheet1: [
        ['1', '2'],
        ['3', '4'],
      ],
      Sheet2: [
        ['{=TRANSPOSE($Sheet1.A1:B2)}', '{=TRANSPOSE($Sheet1.A1:B2)}'],
        ['{=TRANSPOSE($Sheet1.A1:B2)}', '{=TRANSPOSE($Sheet1.A1:B2)}'],
      ],
    })

    engine.addColumns(0, [1, 1])

    expect(extractMatrixRange(engine, adr('A1', 1))).toEqual(new AbsoluteCellRange(adr('A1'), adr('C2')))
  })
})

describe('Adding column', () => {
  it('add column inside numeric matrix, expand matrix', () => {
    const config = new Config({ matrixDetection: true, matrixDetectionThreshold: 1})
    const engine = HyperFormula.buildFromArray([
      ['1', '2'],
      ['3', '4'],
    ], config)

    expect(engine.getCellValue(adr('B1'))).toEqual(2)

    engine.addColumns(0, [1, 2])

    expect(engine.getCellValue(adr('B1'))).toEqual(0)
    expect(engine.getCellValue(adr('C1'))).toEqual(0)
    expect(engine.getCellValue(adr('D1'))).toEqual(2)
  })
})

describe('Adding column - address mapping', () => {
  it('verify sheet dimensions', () => {
    const engine = HyperFormula.buildFromArray([
      ['1', /* new col */ '=A1'],
    ])

    engine.addColumns(0, [1, 1])

    expect(engine.getSheetDimensions(0)).toEqual({
      width: 3,
      height: 1,
    })
  })
})

describe('different sheet', () => {
  it('adding row in different sheet but same row as formula should not update formula address', () => {
    const engine = HyperFormula.buildFromSheets({
      Sheet1: [
        ['1'],
      ],
      Sheet2: [
        ['=$Sheet1.A1'],
      ],
    })

    engine.addColumns(0, [0, 1])

    const formulaVertex = engine.addressMapping.fetchCell(adr('A1', 1)) as FormulaCellVertex

    expect(formulaVertex.address).toEqual(simpleCellAddress(1, 0, 0))
    formulaVertex.getFormula(engine.lazilyTransformingAstService) // force transformations to be applied
    expect(formulaVertex.address).toEqual(simpleCellAddress(1, 0, 0))
  })
})

describe('Adding column - sheet dimensions', () => {
  it('should do nothing when adding column outside effective sheet', () => {
    const engine = HyperFormula.buildFromArray([
      ['1'],
    ])

    const recalcSpy = jest.spyOn(engine.evaluator as any, 'partialRun')
    engine.addColumns(0, [1, 1])
    engine.addColumns(0, [10, 15])

    expect(recalcSpy).not.toHaveBeenCalled()
    expect(engine.getSheetDimensions(0)).toEqual({
      width: 1,
      height: 1,
    })
  });
})

describe('Adding column - column index', () => {
  it('should update column index when adding row', () => {
    const engine = HyperFormula.buildFromArray([
      ['1', '=VLOOKUP(1, A1:A1, 1, TRUE())'],
    ], new Config({ useColumnIndex: true }))
    const index = (engine.columnSearch as ColumnIndex)

    expect_array_with_same_content([0], index.getValueIndex(0, 0, 1).index)

    engine.addColumns(0, [0, 1])

    expect_array_with_same_content([], index.getValueIndex(0, 0, 1).index)
    expect_array_with_same_content([0], index.getValueIndex(0, 1, 1).index)
  })
})

