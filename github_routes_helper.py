# Helper function for file extensions
def get_file_extension(language):
    """Get the appropriate file extension for a language."""
    language = language.lower()  # Normalize to lowercase
    extension_map = {
        "python": ".py",
        "python2": ".py",
        "python3": ".py",
        "javascript": ".js",
        "typescript": ".ts",
        "java": ".java",
        "c": ".c",
        "cpp": ".cpp",
        "c++": ".cpp",
        "csharp": ".cs",
        "c#": ".cs",
        "go": ".go",
        "ruby": ".rb",
        "rust": ".rs",
        "php": ".php",
        "swift": ".swift",
        "kotlin": ".kt",
        "dart": ".dart",
        "scala": ".scala",
        "groovy": ".groovy",
        "perl": ".pl",
        "r": ".r",
        "rscript": ".r",
        "bash": ".sh",
        "shell": ".sh",
        "powershell": ".ps1",
        "lua": ".lua",
        "haskell": ".hs",
        "elixir": ".exs",
        "erlang": ".erl",
        "clojure": ".clj",
        "lisp": ".lisp",
        "scheme": ".scm",
        "racket": ".rkt",
        "fsharp": ".fs",
        "f#": ".fs",
        "ocaml": ".ml",
        "zig": ".zig",
        "nim": ".nim",
        "crystal": ".cr",
        "d": ".d",
        "fortran": ".f90",
        "cobol": ".cbl",
        "pascal": ".pas",
        "prolog": ".pl",
        "html": ".html",
        "css": ".css",
        "coffeescript": ".coffee",
        "elm": ".elm",
        "solidity": ".sol",
        "verilog": ".v",
        "vhdl": ".vhd",
        "matlab": ".m",
        "octave": ".m",
        "sql": ".sql",
        "sqlite3": ".sql"
    }
    
    # Special case handling for common language variants
    if language in ["c++", "cpp"]:
        return ".cpp"
    elif language in ["python", "python2", "python3"]:
        return ".py"
    elif language in ["javascript", "js"]:
        return ".js"
    elif language in ["typescript", "ts"]:
        return ".ts"
    elif language in ["csharp", "c#"]:
        return ".cs"
    
    return extension_map.get(language, ".txt")
