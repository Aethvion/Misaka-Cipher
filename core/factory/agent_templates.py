"""
Misaka Cipher - Agent Templates
Pre-defined agent blueprints for common tasks
"""

from .agent_spec import AgentSpec


class AgentTemplates:
    """
    Collection of pre-defined agent templates.
    
    Provides blueprints for common agent patterns.
    """
    
    @staticmethod
    def data_analyst(data_source: str, analysis_type: str = "summary") -> AgentSpec:
        """
        Data Analyst agent template.
        
        Analyzes datasets and generates insights.
        
        Args:
            data_source: Path or description of data source
            analysis_type: Type of analysis (summary, trends, correlations)
            
        Returns:
            AgentSpec for Data Analyst
        """
        return AgentSpec(
            domain="Data",
            action="Analyze",
            object="Dataset",
            context={
                'prompt': f"Analyze the following data source: {data_source}",
                'instructions': f"Perform {analysis_type} analysis and provide insights.",
                'data_source': data_source,
                'analysis_type': analysis_type
            },
            description=f"Analyze {data_source} ({analysis_type})",
            temperature=0.3  # Lower temperature for analytical tasks
        )
    
    @staticmethod
    def code_reviewer(code: str, language: str = "python") -> AgentSpec:
        """
        Code Reviewer agent template.
        
        Reviews code for quality, security, and best practices.
        
        Args:
            code: Code to review
            language: Programming language
            
        Returns:
            AgentSpec for Code Reviewer
        """
        return AgentSpec(
            domain="Code",
            action="Review",
            object="Quality",
            context={
                'prompt': f"Review this {language} code:\n\n```{language}\n{code}\n```",
                'instructions': (
                    "Review for:\n"
                    "1. Code quality and readability\n"
                    "2. Security vulnerabilities\n"
                    "3. Best practices\n"
                    "4. Performance issues\n"
                    "Provide specific recommendations."
                ),
                'code': code,
                'language': language
            },
            description=f"Review {language} code",
            temperature=0.2
        )
    
    @staticmethod
    def report_generator(topic: str, format: str = "markdown") -> AgentSpec:
        """
        Report Generator agent template.
        
        Creates formatted reports on specified topics.
        
        Args:
            topic: Report topic
            format: Output format (markdown, html, text)
            
        Returns:
            AgentSpec for Report Generator
        """
        return AgentSpec(
            domain="Report",
            action="Generate",
            object="Document",
            context={
                'prompt': f"Generate a comprehensive report on: {topic}",
                'instructions': f"Format: {format}. Include executive summary, key findings, and recommendations.",
                'topic': topic,
                'format': format
            },
            description=f"Generate report on {topic}",
            temperature=0.7
        )
    
    @staticmethod
    def security_auditor(target: str, audit_type: str = "general") -> AgentSpec:
        """
        Security Auditor agent template.
        
        Scans for security vulnerabilities and compliance issues.
        
        Args:
            target: Target to audit (code, config, system description)
            audit_type: Type of audit (general, pii, credentials, injection)
            
        Returns:
            AgentSpec for Security Auditor
        """
        return AgentSpec(
            domain="Security",
            action="Audit",
            object="Vulnerabilities",
            context={
                'prompt': f"Perform {audit_type} security audit on: {target}",
                'instructions': (
                    "Identify:\n"
                    "1. Security vulnerabilities\n"
                    "2. Compliance issues\n"
                    "3. Risk assessment\n"
                    "4. Remediation recommendations"
                ),
                'target': target,
                'audit_type': audit_type
            },
            description=f"Security audit: {audit_type}",
            temperature=0.1  # Very low temperature for security
        )
    
    @staticmethod
    def text_summarizer(text: str, max_length: int = 200) -> AgentSpec:
        """
        Text Summarizer agent template.
        
        Summarizes long text into concise summaries.
        
        Args:
            text: Text to summarize
            max_length: Maximum summary length in words
            
        Returns:
            AgentSpec for Text Summarizer
        """
        return AgentSpec(
            domain="Data",
            action="Summarize",
            object="Content",
            context={
                'prompt': text,
                'instructions': f"Summarize in maximum {max_length} words. Keep key points and main ideas.",
                'max_length': max_length
            },
            description="Summarize text content",
            temperature=0.5
        )
    
    @staticmethod
    def question_answerer(question: str, context: str = "") -> AgentSpec:
        """
        Question Answerer agent template.
        
        Answers questions with or without provided context.
        
        Args:
            question: Question to answer
            context: Optional context to use for answering
            
        Returns:
            AgentSpec for Question Answerer
        """
        prompt = question
        if context:
            prompt = f"Context:\n{context}\n\nQuestion: {question}"
        
        return AgentSpec(
            domain="Knowledge",
            action="Generate",
            object="Query",
            context={
                'prompt': prompt,
                'instructions': "Provide a clear, accurate, and concise answer.",
                'question': question,
                'context': context
            },
            description="Answer question",
            temperature=0.7
        )


def get_template(template_name: str, **kwargs) -> AgentSpec:
    """
    Get an agent template by name.
    
    Args:
        template_name: Name of template (data_analyst, code_reviewer, etc.)
        **kwargs: Arguments for template
        
    Returns:
        AgentSpec instance
        
    Raises:
        ValueError: If template not found
    """
    templates = {
        'data_analyst': AgentTemplates.data_analyst,
        'code_reviewer': AgentTemplates.code_reviewer,
        'report_generator': AgentTemplates.report_generator,
        'security_auditor': AgentTemplates.security_auditor,
        'text_summarizer': AgentTemplates.text_summarizer,
        'question_answerer': AgentTemplates.question_answerer
    }
    
    template_func = templates.get(template_name)
    if not template_func:
        raise ValueError(
            f"Unknown template: {template_name}. "
            f"Available: {', '.join(templates.keys())}"
        )
    
    return template_func(**kwargs)
