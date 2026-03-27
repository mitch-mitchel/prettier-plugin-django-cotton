import { parse, locStart, locEnd } from './parser.js'
import { printer } from './printer.js'

export const languages = [
  {
    name: 'django-html',
    parsers: ['django-html'],
    extensions: ['.html'],
    vscodeLanguageIds: ['django-html', 'html'],
  },
]

export const parsers = {
  'django-html': {
    parse,
    astFormat: 'django-html',
    locStart,
    locEnd,
  },
}

export const printers = {
  'django-html': printer,
}
