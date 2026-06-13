// Per-language fixture corpus for the codemap language sweep.
//
// Each fixture is a minimal 2-module project shaped to exercise all three
// extraction targets at once:
//   - a `core/` module declaring a base type (interface/trait/abstract) + a field-bearing type
//   - an `app/` module declaring a derived type that EXTENDS/IMPLEMENTS the base and IMPORTS core
//
// The sweep asserts, per language, that the generated codemap contains:
//   (1) the derived class in `## Class graph` with the expected extends/implements edge   -> class extraction
//   (2) the field on the base type                                                        -> field extraction
//   (3) a cross-module file edge core <- app in `## File deps`                            -> import extraction
//
// `expect` declares what SHOULD appear if the language were fully supported. The sweep
// reports each as PASS / GAP so the matrix is honest about current coverage rather than
// only testing languages that already work.

export const FIXTURES = [
  {
    lang: 'typescript',
    files: {
      'core/shape.ts':
        `export interface Shape {\n  area(): number;\n}\n\n` +
        `export class Point {\n  public x: number = 0;\n  public y: number = 0;\n}\n`,
      'app/circle.ts':
        `import { Shape } from '../core/shape';\n\n` +
        `export class Circle implements Shape {\n  public radius: number = 1;\n  area(): number { return 3.14 * this.radius * this.radius; }\n}\n`,
    },
    expect: { className: 'Circle', baseType: 'Shape', relation: 'implements', field: 'x', edgeFrom: 'app/circle.ts', edgeTo: 'core/shape.ts' },
  },

  {
    lang: 'csharp',
    files: {
      'core/Shape.cs':
        `namespace Geo.Core;\n\npublic interface IShape {\n  double Area();\n}\n\n` +
        `public class Point {\n  public double X;\n  public double Y;\n}\n`,
      'app/Circle.cs':
        `using Geo.Core;\n\nnamespace Geo.App;\n\n` +
        `public class Circle : IShape {\n  public double Radius;\n  public double Area() { return 3.14 * Radius * Radius; }\n}\n`,
    },
    expect: { className: 'Circle', baseType: 'IShape', relation: 'implements', field: 'X', edgeFrom: 'app/Circle.cs', edgeTo: 'core/Shape.cs' },
  },

  {
    lang: 'cpp',
    files: {
      'core/shape.h':
        `#pragma once\n\nclass Shape {\npublic:\n  virtual double area() const = 0;\n};\n\n` +
        `struct Point {\n  double x;\n  double y;\n};\n`,
      'app/circle.h':
        `#pragma once\n#include "core/shape.h"\n\n` +
        `class Circle : public Shape {\npublic:\n  double radius;\n  double area() const override;\n};\n`,
    },
    expect: { className: 'Circle', baseType: 'Shape', relation: 'extends', field: 'x', edgeFrom: 'app/circle.h', edgeTo: 'core/shape.h' },
  },

  {
    lang: 'python',
    files: {
      'core/shape.py':
        `class Shape:\n    def area(self):\n        raise NotImplementedError\n\n` +
        `class Point:\n    def __init__(self):\n        self.x = 0\n        self.y = 0\n`,
      'app/circle.py':
        `from core.shape import Shape\n\n` +
        `class Circle(Shape):\n    def __init__(self):\n        self.radius = 1\n    def area(self):\n        return 3.14 * self.radius * self.radius\n`,
    },
    expect: { className: 'Circle', baseType: 'Shape', relation: 'extends', field: 'x', edgeFrom: 'app/circle.py', edgeTo: 'core/shape.py' },
  },

  {
    lang: 'java',
    files: {
      'core/Shape.java':
        `package geo.core;\n\npublic interface Shape {\n  double area();\n}\n`,
      'core/Point.java':
        `package geo.core;\n\npublic class Point {\n  public double x;\n  public double y;\n}\n`,
      'app/Circle.java':
        `package geo.app;\n\nimport geo.core.Shape;\n\n` +
        `public class Circle implements Shape {\n  public double radius;\n  public double area() { return 3.14 * radius * radius; }\n}\n`,
    },
    expect: { className: 'Circle', baseType: 'Shape', relation: 'implements', field: 'x', edgeFrom: 'app/Circle.java', edgeTo: 'core/Shape.java' },
  },

  {
    lang: 'kotlin',
    files: {
      'core/Shape.kt':
        `package geo.core\n\ninterface Shape {\n  fun area(): Double\n}\n\n` +
        `class Point {\n  var x: Double = 0.0\n  var y: Double = 0.0\n}\n`,
      'app/Circle.kt':
        `package geo.app\n\nimport geo.core.Shape\n\n` +
        `class Circle : Shape {\n  var radius: Double = 1.0\n  override fun area(): Double = 3.14 * radius * radius\n}\n`,
    },
    expect: { className: 'Circle', baseType: 'Shape', relation: 'implements', field: 'x', edgeFrom: 'app/Circle.kt', edgeTo: 'core/Shape.kt' },
  },

  {
    lang: 'swift',
    files: {
      'core/Shape.swift':
        `public protocol Shape {\n  func area() -> Double\n}\n\n` +
        `public struct Point {\n  public var x: Double = 0\n  public var y: Double = 0\n}\n`,
      'app/Circle.swift':
        `import Foundation\n\n` +
        `public class Circle: Shape {\n  public var radius: Double = 1\n  public func area() -> Double { return 3.14 * radius * radius }\n}\n`,
    },
    // Swift has no file-level import syntax: same-module files reference each other with no
    // `import`. A cross-file edge is not statically determinable, so edgeTo is null (n/a).
    expect: { className: 'Circle', baseType: 'Shape', relation: 'implements', field: 'x', edgeFrom: 'app/Circle.swift', edgeTo: null },
  },

  {
    lang: 'rust',
    files: {
      'core/shape.rs':
        `pub trait Shape {\n    fn area(&self) -> f64;\n}\n\n` +
        `pub struct Point {\n    pub x: f64,\n    pub y: f64,\n}\n`,
      'app/circle.rs':
        `use crate::core::shape::Shape;\n\n` +
        `pub struct Circle {\n    pub radius: f64,\n}\n\n` +
        `impl Shape for Circle {\n    fn area(&self) -> f64 { 3.14 * self.radius * self.radius }\n}\n`,
    },
    expect: { className: 'Circle', baseType: 'Shape', relation: 'implements', field: 'x', edgeFrom: 'app/circle.rs', edgeTo: 'core/shape.rs' },
  },

  {
    lang: 'go',
    files: {
      'core/shape.go':
        `package core\n\ntype Shape interface {\n\tArea() float64\n}\n\n` +
        `type Point struct {\n\tX float64\n\tY float64\n}\n`,
      'app/circle.go':
        `package app\n\nimport "example.com/proj/core"\n\n` +
        `type Circle struct {\n\tcore.Point\n\tRadius float64\n}\n\n` +
        `func (c Circle) Area() float64 { return 3.14 * c.Radius * c.Radius }\n`,
    },
    expect: { className: 'Circle', baseType: 'Point', relation: 'implements', field: 'Radius', edgeFrom: 'app/circle.go', edgeTo: 'core/shape.go' },
  },
];
